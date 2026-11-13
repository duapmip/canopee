"""Extract only published traffic aggregates, never execute the other team's HTML.

python3 scripts/import-hackaviz-traffic.py [local-copy-of-source.html]
Without an argument, downloads the exact Git blob reviewed for this project.
"""
import base64
import hashlib
import json
import re
import sys
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen

BLOB = '89aeac42a683554229edf92e070c0c0fd8db7eff'
API = 'https://api.github.com/repos/hackathons-mobilites/hackaviz_2026/git/blobs/' + BLOB
if len(sys.argv) > 1:
    raw = Path(sys.argv[1]).read_bytes()
else:
    request = Request(API, headers={'User-Agent': 'Canopee-Hackaviz-2026'})
    with urlopen(request, timeout=60) as response:
        raw = base64.b64decode(json.load(response)['content'])
actual = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
if actual != BLOB:
    raise SystemExit('Source differs from the reviewed Git blob: ' + actual)

class Frames(HTMLParser):
    content = None
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'iframe' and a.get('id') == 'vizframe-1':
            self.content = a.get('srcdoc')

parser = Frames()
parser.feed(raw.decode('utf-8'))
if not parser.content:
    raise SystemExit('Missing embedded first chart')
match = re.search(r'window\.__DATA__\s*=\s*', parser.content)
if not match:
    raise SystemExit('Missing data array')
rows, _ = json.JSONDecoder().raw_decode(parser.content[match.end():])
output = {
    'source': 'Île-de-France Mobilités, validations ferroviaires 2025, agrégation publiée par Projet_equipe_3 (Hackaviz 2026)',
    'url': 'https://github.com/hackathons-mobilites/hackaviz_2026/tree/main/Resultats/D%C3%A9fi%201%20-%20Les%20mobilit%C3%A9s%20et%20l%E2%80%99adaptation%20climatique/Projet_equipe_3',
    'sourceBlob': API,
    'gitBlobSha': BLOB,
    'retrieved': date.today().isoformat(),
    'notes': 'Extraction de window.__DATA__ du premier graphique. Valeurs agrégées non recomptées depuis les validations brutes. Une validation ne représente pas une personne distincte ni un trajet à pied. Aucun indice ICU repris.',
    'rows': [{key: row[key] for key in ['nom', 'lat', 'lon', 'freq', 'commune']} for row in rows],
}
path = Path(__file__).resolve().parents[1] / 'public/data/hackaviz-validations-2025.json'
path.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(str(len(rows)) + ' published aggregates imported; source Git blob verified.')
