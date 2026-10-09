"""Pasang tombol Setujui/Tolak pembayaran DriveTech di bot D'Pro Ops (/opt/dpro-ops/bot.py).

Bot WA kantor mengirim kartu bukti bayar DriveTech ke Discord dengan custom_id drivetech:setujui:<kode> dan
drivetech:tolak:<kode>. Patch ini membuat on_interaction meneruskan tombol itu ke API DriveTech
(/api/bot/booking/<kode>/putusan) dengan header x-bot-key. Butuh DRIVETECH_URL dan DRIVETECH_BOT_KEY di
/etc/dpro-ops.env. Aman dijalankan ulang (berhenti kalau sudah terpasang).

Pakai: python3 dpro-ops-drivetech.py /opt/dpro-ops/bot.py
"""
import sys

p = sys.argv[1]
s = open(p).read()
if "drivetech_putusan" in s:
    sys.exit("sudah terpasang")

helper = '''

async def drivetech_putusan(kode, aksi, alasan=""):
    """Setujui/tolak pembayaran DriveTech lewat API aplikasinya (verifyPayment/rejectPayment yang sama dengan /admin)."""
    import aiohttp
    url = os.environ.get("DRIVETECH_URL", "https://drivetech.dpro.events").rstrip("/")
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as http:
            async with http.post(f"{url}/api/bot/booking/{kode}/putusan", json={"aksi": aksi, "alasan": alasan},
                                 headers={"x-bot-key": os.environ.get("DRIVETECH_BOT_KEY", "")}) as r:
                data = await r.json(content_type=None)
    except Exception as e:
        return {"ok": False, "pesan": f"API DriveTech gagal: {e}"}
    if r.status != 200:
        return {"ok": False, "pesan": f"DriveTech menolak ({r.status}): {data.get('error', data)}"}
    return {"ok": True, "pesan": f"DriveTech {kode}: booking {data.get('status')}, pembayaran {data.get('statusBayar')} ({data.get('totalTeks')})."}


class AlasanDriveTech(discord.ui.Modal, title="Tolak pembayaran DriveTech"):
    alasan = discord.ui.TextInput(label="Alasan (dikirim ke penyewa)", style=discord.TextStyle.paragraph, max_length=200,
                                  default="Nominal belum masuk di GoPay Merchant")

    def __init__(self, kode, message):
        super().__init__()
        self.kode, self.message = kode, message

    async def on_submit(self, inter: discord.Interaction):
        await inter.response.defer(thinking=True)
        r = await drivetech_putusan(self.kode, "tolak", str(self.alasan))
        if r.get("ok"):
            await self.message.edit(content=f"{self.message.content}\\n\\n**❌ Ditolak oleh {inter.user.name}: {self.alasan}**", view=None)
        await inter.followup.send(r.get("pesan", str(r)))
        await audit(f"❌ DriveTech {self.kode} ditolak oleh {inter.user.name}: {r.get('pesan')}")
'''
anchor = "\n\n@client.event\nasync def on_message_edit("
assert s.count(anchor) == 1
s = s.replace(anchor, helper + anchor, 1)

old = '''    if not cid.startswith("kuwera:"):
        return
    if not only_superadmin(inter):
        return await inter.response.send_message("Hanya superadmin yang bisa menyetujui pembayaran.", ephemeral=True)
    _, aksi, order = cid.split(":", 2)'''
new = '''    if not cid.startswith(("kuwera:", "drivetech:")):
        return
    if not only_superadmin(inter):
        return await inter.response.send_message("Hanya superadmin yang bisa menyetujui pembayaran.", ephemeral=True)
    app, aksi, order = cid.split(":", 2)
    if app == "drivetech":
        if aksi == "tolak":
            return await inter.response.send_modal(AlasanDriveTech(order, inter.message))
        await inter.response.defer(thinking=True)
        r = await drivetech_putusan(order, "setujui")
        if r.get("ok"):
            await close_card(inter, f"✅ Disetujui oleh {inter.user.name}. Kabar dikirim ke WhatsApp dan email penyewa.")
        await inter.followup.send(r.get("pesan", str(r)))
        return await audit(f"✅ DriveTech {order} disetujui oleh {inter.user.name}: {r.get('pesan')}")'''
assert s.count(old) == 1
s = s.replace(old, new, 1)
open(p, "w").write(s)
print("terpasang")
