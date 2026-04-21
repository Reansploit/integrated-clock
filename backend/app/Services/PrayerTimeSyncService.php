<?php

namespace App\Services;

use App\Models\PrayerTime;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;

class PrayerTimeSyncService
{
    public function syncCurrentMonth(): void
    {
        $now = Carbon::now('Asia/Jakarta');

        $response = Http::timeout(20)
            ->post(config('services.equran.base_url') . '/shalat', [
                'provinsi' => config('services.equran.province'),
                'kabkota' => config('services.equran.city'),
                'bulan' => $now->month,
                'tahun' => $now->year,
            ]);

        if (! $response->successful()) {
            throw new \RuntimeException('Failed to sync prayer times from equran API');
        }

        $items = data_get($response->json(), 'data.jadwal', []);

        foreach ($items as $item) {
            PrayerTime::updateOrCreate(
                ['prayer_date' => data_get($item, 'tanggal')],
                [
                    'imsak' => data_get($item, 'imsak'),
                    'subuh' => data_get($item, 'subuh'),
                    'dzuhur' => data_get($item, 'dzuhur'),
                    'ashar' => data_get($item, 'ashar'),
                    'maghrib' => data_get($item, 'maghrib'),
                    'isya' => data_get($item, 'isya'),
                ]
            );
        }
    }
}
