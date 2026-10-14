"""Builds the sound picker page: picker.template.html with catalog.json inlined, written to dist/index.html.

The clips are published next to the page as files at the paths the catalog names (clips/<event>/<option>.mp3).
Run: python3 -I tools/sound-picker/build_page.py
"""
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent


def main() -> None:
    catalog = json.loads((HERE / 'catalog.json').read_text())
    events = catalog['events']
    # every option must point at a clip that exists, or the page shows a dead play button
    missing = [o['file'] for e in events for o in e['options'] if not (HERE / o['file']).is_file()]
    if missing:
        raise SystemExit(f'{len(missing)} clips missing, e.g. {missing[:3]}')
    page = (HERE / 'picker.template.html').read_text().replace('__CATALOG__', json.dumps(events, ensure_ascii=False))
    out = HERE / 'dist' / 'index.html'
    out.parent.mkdir(exist_ok=True)
    out.write_text(page)
    clips = sum(len(e['options']) for e in events)
    print(f'{out} ({len(page) // 1024} KB): {len(events)} events, {clips} clips')


if __name__ == '__main__':
    main()
