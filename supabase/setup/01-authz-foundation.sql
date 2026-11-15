-- Production authorization foundation. Existing admin allowlist is unchanged.
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM auth.users)<>2 OR (SELECT count(*) FROM public.swim_share_admins)<>1
 OR EXISTS(SELECT 1 FROM public.swim_share_admins a LEFT JOIN auth.users u ON u.id=a.user_id WHERE u.id IS NULL)
 THEN RAISE EXCEPTION 'Account precondition changed; stop and review'; END IF;
END; $$;
CREATE SCHEMA swim_authz_private;
REVOKE ALL ON SCHEMA swim_authz_private FROM PUBLIC,anon,authenticated;
CREATE TABLE swim_authz_private.coaches(user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,status text NOT NULL CHECK(status IN ('pending','approved','suspended')));
ALTER TABLE swim_authz_private.coaches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON swim_authz_private.coaches FROM PUBLIC,anon,authenticated;
INSERT INTO swim_authz_private.coaches(user_id,status)
 SELECT u.id,'approved' FROM auth.users u WHERE NOT EXISTS(SELECT 1 FROM public.swim_share_admins a WHERE a.user_id=u.id);
CREATE TABLE swim_authz_private.approval_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL,target_id uuid NOT NULL,previous_status text NOT NULL,next_status text NOT NULL,changed_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE swim_authz_private.approval_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON swim_authz_private.approval_audit FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.is_swim_coach_approved() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.swim_share_admins WHERE user_id=(SELECT auth.uid())) OR EXISTS(SELECT 1 FROM swim_authz_private.coaches WHERE user_id=(SELECT auth.uid()) AND status='approved'); $$;
CREATE FUNCTION public.request_coach_access() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); result text;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'メール確認済みのログインが必要です' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.swim_share_admins WHERE user_id=actor) THEN RETURN jsonb_build_object('status','admin'); END IF;
 INSERT INTO swim_authz_private.coaches VALUES(actor,'pending') ON CONFLICT(user_id) DO NOTHING;
 SELECT status INTO result FROM swim_authz_private.coaches WHERE user_id=actor;
 RETURN jsonb_build_object('status',result);
END; $$;
CREATE FUNCTION public.list_coach_approvals() RETURNS TABLE(user_id uuid,email text,status text) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.swim_share_admins WHERE user_id=auth.uid()) THEN RAISE EXCEPTION '管理者専用です' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT u.id,u.email::text,coalesce(c.status,'pending') FROM auth.users u LEFT JOIN swim_authz_private.coaches c ON c.user_id=u.id WHERE NOT EXISTS(SELECT 1 FROM public.swim_share_admins a WHERE a.user_id=u.id) ORDER BY u.email;
END; $$;
CREATE FUNCTION public.set_coach_approval(p_user_id uuid,p_status text,p_expected_status text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); old_status text;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.swim_share_admins WHERE user_id=actor) THEN RAISE EXCEPTION '管理者専用です' USING ERRCODE='42501'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('approved','pending','suspended') OR p_expected_status IS NULL OR p_expected_status NOT IN ('approved','pending','suspended') THEN RAISE EXCEPTION '承認状態が不正です' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id) OR EXISTS(SELECT 1 FROM public.swim_share_admins WHERE user_id=p_user_id) THEN RAISE EXCEPTION '対象のコーチを確認してください' USING ERRCODE='42501'; END IF;
 INSERT INTO swim_authz_private.coaches VALUES(p_user_id,'pending') ON CONFLICT(user_id) DO NOTHING;
 SELECT status INTO old_status FROM swim_authz_private.coaches WHERE user_id=p_user_id FOR UPDATE;
 IF old_status IS DISTINCT FROM p_expected_status THEN RAISE EXCEPTION '状態が変更されています。再読み込みしてください' USING ERRCODE='40001'; END IF;
 IF old_status=p_status THEN RETURN jsonb_build_object('changed',false,'status',old_status); END IF;
 UPDATE swim_authz_private.coaches SET status=p_status WHERE user_id=p_user_id;
 INSERT INTO swim_authz_private.approval_audit(actor_id,target_id,previous_status,next_status) VALUES(actor,p_user_id,old_status,p_status);
 RETURN jsonb_build_object('changed',true,'status',p_status);
END; $$;
REVOKE ALL ON FUNCTION public.is_swim_coach_approved(),public.request_coach_access(),public.list_coach_approvals(),public.set_coach_approval(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_swim_coach_approved(),public.request_coach_access(),public.list_coach_approvals(),public.set_coach_approval(uuid,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
