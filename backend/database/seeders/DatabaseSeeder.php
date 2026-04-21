<?php

namespace Database\Seeders;

use App\Models\Mufrodat;
use App\Models\PrayerOffset;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        foreach (['imsak', 'subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'] as $prayer) {
            PrayerOffset::query()->firstOrCreate([
                'prayer_name' => $prayer,
            ], [
                'offset_minutes' => 0,
            ]);
        }

        Mufrodat::query()->insert([
            ['arabic_word' => 'مَدْرَسَة', 'translation' => 'Sekolah', 'sort_order' => 1, 'is_active' => true],
            ['arabic_word' => 'مُعَلِّم', 'translation' => 'Guru', 'sort_order' => 2, 'is_active' => true],
            ['arabic_word' => 'طَالِب', 'translation' => 'Siswa', 'sort_order' => 3, 'is_active' => true],
        ]);
    }
}
