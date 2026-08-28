# -*- coding: utf-8 -*-
"""Generator public/denah.svg dari hasil ekstraksi "layout-venue.jpeg".

Jalankan: python3 tools/generate-denah-svg.py

Koordinat di file ini adalah sumber kebenaran tata letak dan HARUS tetap sinkron dengan
src/lib/domain/layout.ts (versi React untuk denah realtime) dan supabase/seed.sql
(kolom svg_element_id). Kalau denah event berubah, ubah di sini lalu samakan keduanya.
"""
import math

W, H = 1123, 1600
out = []
A = out.append

def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def clamp(lo, v, hi):
    return max(lo, min(hi, v))

def wrap(label, max_chars):
    words, lines, cur = label.split(), [], ''
    for w in words:
        cand = (cur + ' ' + w).strip()
        if len(cand) <= max_chars or not cur:
            cur = cand
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines

def label_text(cx, cy, label, box_w, box_h, vertical, fill='#0f172a', weight=700):
    """Teks multi-baris, otomatis rotate -90 untuk kotak sempit-tinggi."""
    fs = clamp(10, round(min(box_w, box_h) * 0.16), 22)
    avail = box_h if vertical else box_w
    max_chars = max(4, int(avail / (fs * 0.55)))
    lines = wrap(label, max_chars)
    lh = fs * 1.15
    y0 = cy - (len(lines) - 1) * lh / 2
    tf = ' transform="rotate(-90 %g %g)"' % (cx, cy) if vertical else ''
    parts = ['<text x="%g" y="%g"%s font-size="%d" font-weight="%d" fill="%s" '
             'text-anchor="middle" dominant-baseline="middle">' % (cx, y0, tf, fs, weight, fill)]
    for i, ln in enumerate(lines):
        dy = 0 if i == 0 else lh
        parts.append('<tspan x="%g" dy="%g">%s</tspan>' % (cx, dy, esc(ln)))
    parts.append('</text>')
    return ''.join(parts)

def number_text(cx, cy, n, box_h):
    fs = clamp(9, round(box_h * 0.42), 18)
    return ('<text x="%g" y="%g" font-size="%d" font-weight="700" fill="#0f172a" '
            'text-anchor="middle" dominant-baseline="middle">%d</text>' % (cx, cy, fs, n))

def slot(sid, x, y, w, h, number=None, label=None, vertical=False, facility=False):
    """Satu kotak slot.

    Slot BOOKABLE (bukan facility/warung) dibungkus <a href="/booking/by-svg/<sid>">
    dan diberi data-form dengan URL yang sama, sehingga file SVG yang dibuka
    langsung pun bisa diklik menuju form booking slot itu. Rute
    /booking/by-svg/[svgId] menerjemahkan id elemen SVG ke uuid slot database
    lalu redirect ke /booking/<uuid>. Slot facility/warung TANPA <a>.
    """
    cx, cy = x + w / 2, y + h / 2
    aria = esc(label or ('Slot %d' % number))
    if facility:
        A('      <g id="%s" class="slot facility" data-status="facility" data-slot="%s" aria-label="%s">'
          % (sid, sid, aria))
    else:
        form_url = '/booking/by-svg/%s' % sid
        A('      <a href="%s" aria-label="%s — buka form booking">' % (form_url, aria))
        A('      <g id="%s" class="slot" data-status="available" data-slot="%s" data-form="%s">'
          % (sid, sid, form_url))
    A('        <rect x="%g" y="%g" width="%g" height="%g" rx="4"/>' % (x, y, w, h))
    if number is not None:
        A('        ' + number_text(cx, cy, number, h))
    else:
        A('        ' + label_text(cx, cy, label, w, h, vertical))
    A('      </g>')
    if not facility:
        A('      </a>')

def tank(x, y, w, h, rotate=0, gid=None, overhang=22, with_label=True):
    """Tank display Kostrad, tampak atas stilasi: 2 track + hull + turret + laras.

    (x, y, w, h) adalah badan SEBELUM rotasi; laras menghadap sumbu +x dan
    memanjang ~overhang px melewati ujung depan. Rotasi mengelilingi titik
    tengah badan. Dekor murni: bukan slot, tidak ada di database.
    """
    cx, cy = x + w / 2, y + h / 2
    th = max(3, round(h * 0.24))            # tebal track
    rx_track = min(3, th / 2)
    barrel_h = max(2.4, h * 0.12)
    turret_cx = x + w * 0.45
    turret_r = max(3.5, h * 0.30)
    hull_sw = 1.5 if h >= 24 else 1
    A('    <g%s>' % (' id="%s"' % gid if gid else ''))
    tf = ' transform="rotate(%g %g %g)"' % (rotate, cx, cy) if rotate else ''
    A('      <g%s>' % tf)
    A('        <rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="#3f6212"/>'
      % (x, y, w, th, rx_track))
    A('        <rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="#3f6212"/>'
      % (x, y + h - th, w, th, rx_track))
    A('        <rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="#5f8f3e" '
      'stroke="#3f6212" stroke-width="%g"/>'
      % (x + w * 0.04, y + th * 0.5, w * 0.92, h - th, h * 0.16, hull_sw))
    A('        <rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="#3f6212"/>'
      % (turret_cx, cy - barrel_h / 2, x + w + overhang - turret_cx, barrel_h, barrel_h / 2))
    A('        <circle cx="%g" cy="%g" r="%g" fill="#46702e"/>' % (turret_cx, cy, turret_r))
    A('      </g>')
    if with_label:
        # label tegak di bawah bounding box hasil rotasi (termasuk laras)
        rad = math.radians(rotate)
        pts = [(x, y), (x + w + overhang, y), (x, y + h), (x + w + overhang, y + h)]
        max_y = max(cy + (px - cx) * math.sin(rad) + (py - cy) * math.cos(rad)
                    for px, py in pts)
        A('      <text x="%g" y="%g" font-size="9" font-weight="600" fill="#3f6212" '
          'text-anchor="middle">Tank</text>' % (cx, max_y + 9))
    A('    </g>')

# ----------------------------------------------------------------- header
A('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" '
  'preserveAspectRatio="xMidYMid meet" role="img" '
  'aria-labelledby="denah-title denah-desc" font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">' % (W, H, W, H))
A('  <title id="denah-title">Denah Pameran Mobil &amp; Motor Bekas</title>')
A('  <desc id="denah-desc">Denah lokasi pameran: tenda pameran mobil baru, area pameran mobil, '
  'area pameran mobil dan motor, area UMKM, warung (belum dibuka untuk booking online), '
  'fasilitas umum, serta tiga tank display Kostrad sebagai dekorasi. '
  'Setiap slot punya id yang sama dengan kolom svg_element_id di database, dan atribut '
  'data-status yang menentukan warnanya (available, pending, confirmed, facility). '
  'Slot yang dapat disewa online adalah tautan menuju /booking/by-svg/&lt;id&gt; '
  '(atribut data-form berisi URL yang sama), yang meneruskan ke form booking slot itu.</desc>')
A('''  <style>
    .slot rect { fill:#dcfce7; stroke:#16a34a; stroke-width:2; transition:fill .15s ease; }
    .slot[data-status="pending"]   rect { fill:#fef3c7; stroke:#d97706; }
    .slot[data-status="confirmed"] rect { fill:#fee2e2; stroke:#dc2626; }
    .slot[data-status="facility"]  rect { fill:#e2e8f0; stroke:#94a3b8; }
    a { cursor:pointer; }
    a:hover .slot rect { stroke-width:3.5; }
    a:focus-visible .slot rect { stroke:#0f172a; stroke-width:3.5; outline:none; }
    .zone-box   { fill:#ffffff; stroke:#cbd5e1; stroke-width:1.5; }
    .zone-title { fill:#ffffff; font-weight:700; font-size:14px; }
    .zone-count { fill:#475569; font-size:11px; }
    .decor-taman { fill:#e8f5e9; stroke:#a5d6a7; stroke-width:1.5; }
    .decor-label { fill:#66a06b; font-size:12px; font-weight:600; }
    .note { fill:#1e293b; font-size:12px; font-weight:700; }
    .legend-label { fill:#334155; font-size:13px; }
  </style>''')
A('  <rect width="%d" height="%d" fill="#f8fafc"/>' % (W, H))
A('  <rect x="24" y="24" width="1075" height="1552" rx="8" fill="none" stroke="#1e293b" stroke-width="2"/>')
A('  <text x="561" y="64" text-anchor="middle" font-size="21" font-weight="800" fill="#0f172a">'
  'DENAH PAMERAN MOBIL &amp; MOTOR BEKAS</text>')

# ----------------------------------------------------------------- dekor
A('  <g id="denah-dekor" aria-hidden="true" pointer-events="none">')
A('    <rect id="pagar-atas" x="122" y="96" width="766" height="10" rx="5" fill="#7cb342"/>')
for did, x, y, w, h in [
    ('taman-tengah', 468, 378, 46, 452),
    ('taman-kanan', 890, 456, 120, 674),
    ('taman-kiri-bawah', 122, 1012, 440, 116),
    ('taman-tengah-bawah', 655, 1012, 185, 116),
]:
    A('    <rect id="%s" class="decor-taman" x="%g" y="%g" width="%g" height="%g" rx="6"/>' % (did, x, y, w, h))
    vert = h > w * 2
    cx, cy = x + w / 2, y + h / 2
    tf = ' transform="rotate(-90 %g %g)"' % (cx, cy) if vert else ''
    A('    <text class="decor-label" x="%g" y="%g"%s text-anchor="middle" '
      'dominant-baseline="middle">Taman</text>' % (cx, cy, tf))
A('  </g>')

# ------------------------------------------------ tank display Kostrad (dekor)
A('  <g id="denah-tank" aria-hidden="true" pointer-events="none">')
for gid, x, y, w, h, rot in [
    ('tank-sekretariat', 285, 150, 96, 40, -45),  # samping Kantor Sekretariat, moncong kanan-atas
    ('tank-umkm',        125, 582, 100, 38, 0),   # tepi kiri antara Warmindo & Warung 1
    ('tank-warung',      573, 938, 96, 38, 90),   # vertikal antara Warung 10 & Warung Sate & Gule
]:
    tank(x, y, w, h, rotate=rot, gid=gid)
A('  </g>')

# ------------------------------------------------------------- anotasi
A('  <g id="denah-anotasi" aria-hidden="true" pointer-events="none">')
A('    <text class="note" x="970" y="145" text-anchor="middle">PINTU MASUK &amp; KELUAR</text>')
A('    <text class="note" x="970" y="167" text-anchor="middle">REST AREA KOSTRAD</text>')
A('    <path d="M 1040 180 L 1040 330" stroke="#1e293b" stroke-width="3" fill="none"/>')
A('  </g>')

# -------------------------------------------------------------- zona
def zone_open(gid, name, accent, container=None, vertical_title=False, total=0):
    A('  <g id="%s" data-zone-type-accent="%s">' % (gid, accent))
    if container:
        x, y, w, h = container
        A('    <rect class="zone-box" x="%g" y="%g" width="%g" height="%g" rx="10"/>' % (x, y, w, h))
        if vertical_title:
            A('    <rect x="%g" y="%g" width="24" height="%g" rx="10" fill="%s"/>' % (x, y, h, accent))
            A('    <text class="zone-title" x="%g" y="%g" transform="rotate(-90 %g %g)" '
              'text-anchor="middle" dominant-baseline="middle">%s</text>'
              % (x + 12, y + h / 2, x + 12, y + h / 2, esc(name)))
            A('    <text class="zone-count" x="%g" y="%g" text-anchor="end">%d slot</text>'
              % (x + w - 6, y + 17, total))
        else:
            A('    <rect x="%g" y="%g" width="%g" height="24" rx="10" fill="%s"/>' % (x, y, w, accent))
            A('    <rect x="%g" y="%g" width="%g" height="12" fill="%s"/>' % (x, y + 12, w, accent))
            A('    <text class="zone-title" x="%g" y="%g" text-anchor="middle" '
              'dominant-baseline="middle">%s</text>' % (x + w / 2, y + 13, esc(name)))
            A('    <text x="%g" y="%g" text-anchor="end" font-size="11" fill="#ffffff" '
              'fill-opacity="0.8" dominant-baseline="middle">%d slot</text>'
              % (x + w - 8, y + 13, total))
    A('    <g class="slots">')

def zone_close():
    A('    </g>')
    A('  </g>')

# 1. Tenda Pameran Mobil Baru — 10 slot
zone_open('zone-mobil-baru', 'TENDA PAMERAN MOBIL BARU', '#7030a0', (505, 110, 348, 216), total=10)
xs = [512, 579, 646, 713, 780]
for i in range(10):
    slot('slot-mobil-baru-%02d' % (i + 1), xs[i % 5], 140 if i < 5 else 258, 62, 58, number=i + 1)
zone_close()

# 2. Area Pameran Mobil — 30 slot (3 kelompok, persis gambar)
zone_open('zone-mobil-bekas', 'AREA PAMERAN MOBIL', '#c00000', (514, 366, 250, 444), total=30)
for i in range(10):
    slot('slot-mobil-bekas-%02d' % (i + 1), 520, 416 + i * 38.5, 52, 33, number=i + 1)
for i in range(10):
    slot('slot-mobil-bekas-%02d' % (i + 11), 632, 410 + i * 38.5, 56, 33, number=i + 11)
for i in range(10):
    slot('slot-mobil-bekas-%02d' % (i + 21), 698, 410 + i * 38.5, 56, 33, number=i + 21)
A('    </g>')
A('    <g class="zone-annotations" aria-hidden="true" pointer-events="none">')
A('      <text x="556" y="403" font-size="11" font-weight="700" fill="#334155">MASUK</text>')
A('      <path d="M 596 399 l 9 4 l -9 4 z" fill="#334155"/>')
A('      <text x="694" y="403" font-size="11" font-weight="700" fill="#334155">KELUAR</text>')
A('      <path d="M 740 399 l 9 4 l -9 4 z" fill="#334155"/>')
A('    </g>')
A('  </g>')

# 3. Area Pameran Motor — 14 slot (fokus motor, keputusan pemilik 2026-08-29)
zone_open('zone-mobil-motor', 'AREA PAMERAN MOTOR', '#ff00ff',
          (774, 430, 90, 430), vertical_title=True, total=14)
for i in range(14):
    slot('slot-mobil-motor-%02d' % (i + 1), 800, 462 + i * 27.6, 48, 24, number=i + 1)
zone_close()

# 4. Area UMKM — 20 slot (kolom kiri 1-10 & kanan 21-30). Kolom TENGAH (11-20)
#    adalah zona terpisah Booth Leasing & Brand Otomotif (booth 2 sisi) —
#    svg_element_id tetap slot-umkm-XX agar cocok dengan database.
zone_open('zone-umkm', 'AREA UMKM', '#0070c0', (236, 444, 230, 386), total=20)
for cx0, start in ((240, 1), (430, 21)):
    for row in range(10):
        n = start + row
        slot('slot-umkm-%02d' % n, cx0, 474 + row * 34.4, 34, 32, number=n)
zone_close()

# 4b. Booth Leasing & Brand Otomotif — 10 booth 2 sisi di kolom tengah UMKM
#     (11-15 bank/leasing, 16-20 brand otomotif; tanpa container sendiri).
zone_open('zone-booth-khusus', 'BOOTH LEASING & OTOMOTIF', '#0f766e', None, total=10)
for row in range(10):
    n = 11 + row
    slot('slot-umkm-%02d' % n, 322, 474 + row * 34.4, 34, 32, number=n)
zone_close()

# 5. Warung — 12 unit (tersebar, tanpa container).
# Kebijakan: warung BELUM dibuka untuk booking online — digambar netral abu
# seperti fasilitas (data-status="facility", tanpa role/tabindex), label tetap.
zone_open('zone-warung', 'WARUNG', '#bf8f00', None, total=12)
WARUNG = [
    ('slot-warung-warmindo', 122, 440, 113, 120, 'Warmindo', False),
    ('slot-warung-01', 122, 632, 113, 108, 'Warung 1', False),
    ('slot-warung-02', 122, 744, 113, 56, 'Warung 2', False),
    ('slot-warung-03', 122, 804, 113, 54, 'Warung 3', False),
    ('slot-warung-04', 122, 862, 113, 42, 'Warung 4', False),
    ('slot-warung-05', 122, 908, 93, 96, 'Warung 5', True),
    ('slot-warung-06', 219, 908, 64, 96, 'Warung 6', True),
    ('slot-warung-07', 287, 908, 64, 96, 'Warung 7', True),
    ('slot-warung-08', 355, 908, 64, 96, 'Warung 8', True),
    ('slot-warung-09', 423, 908, 66, 96, 'Warung 9', True),
    ('slot-warung-10', 493, 908, 66, 96, 'Warung 10', True),
    ('slot-warung-sate-gule', 655, 908, 185, 96, 'Warung Sate & Gule', False),
]
for sid, x, y, w, h, lbl, vert in WARUNG:
    slot(sid, x, y, w, h, label=lbl, vertical=vert, facility=True)
zone_close()

# 6. Fasilitas Umum — 8 unit (tidak bisa dibooking)
zone_open('zone-fasilitas', 'FASILITAS UMUM', '#808080', None, total=8)
FASILITAS = [
    ('slot-fasilitas-kantor-sekretariat', 122, 133, 168, 64, 'Kantor Sekretariat & Rest Area Kostrad', False),
    ('slot-fasilitas-stage-utama', 385, 138, 74, 48, 'Stage Utama', False),
    ('slot-fasilitas-tempat-cuci', 122, 272, 113, 164, 'Tempat Cuci Mobil & Motor', True),
    ('slot-fasilitas-area-zumba', 239, 272, 222, 164, 'Area Zumba', False),
    ('slot-fasilitas-musholah', 890, 325, 120, 126, 'Musholah', False),
    ('slot-fasilitas-lapangan-tembak', 120, 1180, 570, 250, 'Lapangan Tembak', False),
    ('slot-fasilitas-parkiran', 695, 1180, 110, 250, 'Parkiran Untuk Pengunjung', True),
    ('slot-fasilitas-kolam-pemancingan', 810, 1180, 225, 250, 'Kolam Pemancingan', False),
]
for sid, x, y, w, h, lbl, vert in FASILITAS:
    slot(sid, x, y, w, h, label=lbl, vertical=vert, facility=True)
zone_close()

# ------------------------------------------------------------- legenda
A('  <g id="denah-legenda" aria-hidden="true" pointer-events="none">')
A('    <line x1="60" y1="1448" x2="1063" y2="1448" stroke="#cbd5e1" stroke-width="1"/>')
A('    <text x="60" y="1472" font-size="14" font-weight="800" fill="#0f172a">KETERANGAN</text>')
for x, fill, stroke, lbl in [
    (60, '#dcfce7', '#16a34a', 'Tersedia'),
    (175, '#fef3c7', '#d97706', 'Menunggu Pembayaran'),
    (366, '#fee2e2', '#dc2626', 'Terisi'),
    (466, '#e2e8f0', '#94a3b8', 'Fasilitas & warung (tidak disewakan online)'),
]:
    A('    <rect x="%g" y="1486" width="24" height="20" rx="4" fill="%s" stroke="%s" stroke-width="2"/>'
      % (x, fill, stroke))
    A('    <text class="legend-label" x="%g" y="1496" dominant-baseline="middle">%s</text>'
      % (x + 32, esc(lbl)))
tank(830, 1489, 26, 14, gid='legenda-tank', overhang=8, with_label=False)
A('    <text class="legend-label" x="872" y="1496" dominant-baseline="middle">Tank display Kostrad</text>')
for x, accent, lbl in [
    (60, '#7030a0', 'Tenda Mobil Baru'),
    (210, '#c00000', 'Area Pameran Mobil'),
    (375, '#ff00ff', 'Area Mobil &amp; Motor'),
    (540, '#0070c0', 'Area UMKM'),
    (646, '#bf8f00', 'Warung'),
    (732, '#808080', 'Fasilitas'),
]:
    A('    <rect x="%g" y="1526" width="16" height="16" rx="3" fill="%s"/>' % (x, accent))
    A('    <text class="legend-label" x="%g" y="1535" font-size="12" dominant-baseline="middle">%s</text>'
      % (x + 22, lbl))
A('    <text x="1063" y="1562" text-anchor="end" font-size="11" fill="#94a3b8">'
  'Sumber: layout-venue.jpeg &#183; 104 slot (84 dapat disewa online) &#183; '
  'id tiap slot = kolom svg_element_id di database &#183; '
  'klik slot bookable = /booking/by-svg/&lt;id&gt;</text>')
A('  </g>')
A('</svg>')

svg = '\n'.join(out) + '\n'
import os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
target = os.path.join(root, 'public', 'denah.svg')
os.makedirs(os.path.dirname(target), exist_ok=True)
with open(target, 'w') as f:
    f.write(svg)
print('ditulis:', target, '(%d bytes)' % len(svg))
