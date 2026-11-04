-- =============================================================================
-- Tahan sementara slot untuk peserta lunas yang slot lamanya tidak digambar lagi di layout final 4 November.
--
-- Andrew: peserta yang sudah bayar memilih slot baru lebih dulu, batasnya Kamis 5 November 2026 pukul 12.00 WIB.
-- MB2 dan MB3 ditahan untuk Hyundai (MB13) dan Mitsubishi (MB8), O2 dan O3 untuk Rifqi (O11) dan Bejo Ban (O12).
-- Status 'pending' = diblokir panitia, jadi tidak bisa dipesan orang lain. Setelah batas lewat atau peserta sudah
-- memilih, buka lagi lewat /drivetechadmin/slots atau jalankan blok "buka" di bawah.
-- Jalankan sesudah 20261104-layout-final.sql.
-- =============================================================================
begin;

update public.slots
   set status = 'pending',
       peruntukan = 'Ditahan untuk peserta lunas sampai 5 Nov 12.00 WIB'
 where svg_element_id in ('slot-mobil-baru-02', 'slot-mobil-baru-03', 'slot-otomotif-02', 'slot-otomotif-03');

commit;

-- Buka lagi (jalankan manual setelah 5 Nov 12.00 untuk slot yang tidak dipilih):
-- update public.slots set status = 'available', peruntukan = null
--  where svg_element_id in ('slot-mobil-baru-02', 'slot-mobil-baru-03', 'slot-otomotif-02', 'slot-otomotif-03');
