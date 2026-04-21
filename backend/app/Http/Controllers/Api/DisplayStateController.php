<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Models\MediaAsset;
use App\Models\Mufrodat;
use App\Models\PrayerOffset;
use App\Models\PrayerTime;
use App\Models\Setting;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;

class DisplayStateController extends Controller
{
    public function index(): JsonResponse
    {
        $now = Carbon::now('Asia/Jakarta');
        $today = $now->toDateString();
        $time = $now->format('H:i:s');

        $prayerTime = PrayerTime::query()->whereDate('prayer_date', $today)->first();
        $offsets = PrayerOffset::query()->pluck('offset_minutes', 'prayer_name');
        $activeEvent = Event::query()->activeNow($today, $time)->orderBy('start_time')->first();
        $activeVideo = MediaAsset::query()->scheduledNow($time)->first();

        return response()->json([
            'server_time' => $now->toIso8601String(),
            'theme' => Setting::query()->where('key', 'theme')->value('value') ?? ['mode' => 'auto'],
            'boot_video' => MediaAsset::query()->where('type', 'boot_video')->where('is_active', true)->latest()->first(),
            'background' => [
                'image' => MediaAsset::query()->where('type', 'background_image')->where('is_active', true)->latest()->first(),
                'video' => MediaAsset::query()->where('type', 'background_video')->where('is_active', true)->latest()->first(),
            ],
            'active_video' => $activeVideo,
            'active_event' => $activeEvent,
            'mufrodat' => Mufrodat::query()->where('is_active', true)->orderBy('sort_order')->get(),
            'prayer_times' => $this->withOffsets($prayerTime?->toArray() ?? [], $offsets->toArray()),
            'night_mode' => $now->hour >= 21,
        ]);
    }

    private function withOffsets(array $prayerTime, array $offsets): array
    {
        $prayers = ['imsak', 'subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'];

        foreach ($prayers as $prayer) {
            if (! isset($prayerTime[$prayer])) {
                continue;
            }
            $offset = $offsets[$prayer] ?? 0;
            $prayerTime[$prayer] = Carbon::createFromFormat('H:i:s', $prayerTime[$prayer])
                ->addMinutes($offset)
                ->format('H:i');
        }

        return $prayerTime;
    }
}
