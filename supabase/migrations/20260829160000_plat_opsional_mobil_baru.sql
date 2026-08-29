-- Mobil baru tidak punya nomor plat (permintaan pemilik 2026-08-29): plate_number
-- kini boleh NULL. Zona kendaraan bekas tetap mewajibkan plat (ditegakkan di service).
alter table public.vehicle_listings alter column plate_number drop not null;
