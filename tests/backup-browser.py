"""ローカルの架空データだけで確認するブラウザテスト。外部通信は禁止。"""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

HTML = (Path(__file__).resolve().parents[1] / 'index.html').read_text()
SOURCE = HTML[HTML.index('const SWIM_BACKUP_FORMAT_VERSION='):HTML.index('function renderHome()')]
FAKE = """
const APP_BUILD_VERSION='browser-test';
let session={},shareAdmin=true,failBackup=false;
const fakeData={swimmers:[{id:'s1',active:false}],swim_records:[{id:'r1',swimmer_id:'s1'}],swim_manual_laps:[{id:'l1',record_id:'r1'}]};
const sb={from(table){return {
 select(fields,options){this.head=options.head;return this},
 order(){return this},range(){return this},
 then(resolve){resolve({count:fakeData[table].length,data:this.head?null:fakeData[table],error:failBackup?{message:'架空の取得エラー'}:null})}
}}};
"""

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        page = await browser.new_page(accept_downloads=True)
        requests, errors, dialogs, downloads = [], [], [], []
        await page.route('**/*', lambda route: route.abort())
        page.on('request', lambda request: requests.append(request.url))
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('download', lambda download: downloads.append(download))
        cancel_preview = False

        async def dialog_handler(dialog):
            dialogs.append(dialog.message)
            if cancel_preview and dialog.message.startswith('取得・検証が完了'):
                await dialog.dismiss()
            else:
                await dialog.accept()

        page.on('dialog', dialog_handler)
        await page.set_content('<button id="backupDownloadBtn" onclick="downloadSwimBackup()">📥 バックアップを保存</button>')
        await page.add_script_tag(content=FAKE + SOURCE)
        async with page.expect_download() as download_info:
            await page.get_by_role('button').click()
        download = await download_info.value
        backup = json.loads(Path(await download.path()).read_text())
        assert backup['format_version'] == 2
        assert backup['counts'] == {'swimmers': 1, 'swim_records': 1, 'swim_manual_laps': 1}
        assert backup['validation']['status'] == 'passed'
        assert download.suggested_filename.startswith('swim_backup_')
        assert any('関連付け検証：正常' in message for message in dialogs)
        assert await page.get_by_role('button').is_enabled()
        cancel_preview = True
        await page.get_by_role('button').click()
        assert len(downloads) == 1
        cancel_preview = False
        await page.evaluate('failBackup=true')
        await page.get_by_role('button').click()
        assert len(downloads) == 1
        assert any('ファイルは保存しません' in message for message in dialogs)
        assert await page.get_by_role('button').is_enabled()
        assert requests == [], requests
        assert errors == [], errors
        print('PASS: 実ブラウザでJSON保存、保存前確認、キャンセル、取得失敗時の保存停止、ボタン復帰。外部通信0件。')
        await browser.close()

asyncio.run(main())
