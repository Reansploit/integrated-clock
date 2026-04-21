<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PrayerOffset extends Model
{
    protected $fillable = ['prayer_name', 'offset_minutes'];
}
