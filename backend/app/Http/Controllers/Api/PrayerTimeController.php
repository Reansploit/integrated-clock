<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PrayerOffset;
use App\Models\PrayerTime;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PrayerTimeController extends Controller
{
    public function today(): JsonResponse
    {
        $today = Carbon::now('Asia/Jakarta')->toDateString();
        $record = PrayerTime::query()->whereDate('prayer_date', $today)->firstOrFail();
        $offsets = PrayerOffset::query()->pluck('offset_minutes', 'prayer_name');

        $data = $record->toArray();
        foreach (['imsak', 'subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'] as $name) {
            $data[$name] = Carbon::createFromFormat('H:i:s', $data[$name])
                ->addMinutes((int)($offsets[$name] ?? 0))
                ->format('H:i');
        }

        return response()->json($data);
    }

    public function updateOffsets(Request $request): JsonResponse
    {
        $payload = $request->validate([
            '*.prayer_name' => 'required|string|in:imsak,subuh,dzuhur,ashar,maghrib,isya',
            '*.offset_minutes' => 'required|integer|min:-60|max:60',
        ]);

        foreach ($payload as $item) {
            PrayerOffset::query()->updateOrCreate(
                ['prayer_name' => $item['prayer_name']],
                ['offset_minutes' => $item['offset_minutes']]
            );
        }

        return response()->json(['message' => 'Offsets updated']);
    }
}
