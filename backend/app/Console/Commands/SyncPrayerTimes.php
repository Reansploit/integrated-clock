<?php

namespace App\Console\Commands;

use App\Services\PrayerTimeSyncService;
use Illuminate\Console\Command;

class SyncPrayerTimes extends Command
{
    protected $signature = 'prayer-times:sync';
    protected $description = 'Sync monthly prayer times from external API';

    public function handle(PrayerTimeSyncService $syncService): int
    {
        $syncService->syncCurrentMonth();
        $this->info('Prayer times synced successfully.');

        return self::SUCCESS;
    }
}
