-- =============================================================================
-- Revisi layout 6 November 2026: Area A Mobil Baru tinggal satu baris MB1-MB3
-- (Toyota MB1, Mitsubishi MB2, Hyundai MB3). Hyundai (BK-A7E7ED88BE) pindah dari MB6
-- ke MB3 dengan langkah yang sama seperti adminMoveBookingSlot (booking, tanggal aktif,
-- listing katalog). MB6-MB8 tidak digambar lagi dan diblokir supaya tidak bisa dipesan.
-- Sudah dijalankan di produksi 6 Nov 2026 16.21 WIB setelah backup
-- /root/backup-drivetech/drivetech-20261106-0921-sebelum-layout-mb-1baris.sql.gz.
-- =============================================================================
begin;

update bookings set slot_id = (select id from slots where svg_element_id = 'slot-mobil-baru-03'), updated_at = now()
 where booking_code = 'BK-A7E7ED88BE' and status = 'confirmed';
update booking_dates set slot_id = (select slot_id from bookings where booking_code = 'BK-A7E7ED88BE')
 where booking_id = (select id from bookings where booking_code = 'BK-A7E7ED88BE') and is_active;
update vehicle_listings set slot_id = (select slot_id from bookings where booking_code = 'BK-A7E7ED88BE')
 where booking_id = (select id from bookings where booking_code = 'BK-A7E7ED88BE');

update slots set status = 'pending', peruntukan = 'Dihapus dari layout 6 Nov (Area A tinggal MB1-MB3)', updated_at = now()
 where svg_element_id in ('slot-mobil-baru-06', 'slot-mobil-baru-07', 'slot-mobil-baru-08')
   and not exists (select 1 from booking_dates d where d.slot_id = slots.id and d.is_active);

commit;
