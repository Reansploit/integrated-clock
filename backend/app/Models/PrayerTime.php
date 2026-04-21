<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PrayerTime extends Model
{
    protected $fillable = [
        'prayer_date',
        'imsak',
        'subuh',
        'dzuhur',
        'ashar',
        'maghrib',
        'isya',
    ];

    protected $casts = [
        'prayer_date' => 'date',
    ];
}
