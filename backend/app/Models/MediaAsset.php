<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class MediaAsset extends Model
{
    protected $fillable = [
        'type',
        'title',
        'path',
        'mime_type',
        'duration_seconds',
        'start_time',
        'end_time',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function scopeScheduledNow(Builder $query, string $currentTime): Builder
    {
        return $query->where('type', 'scheduled_video')
            ->where('is_active', true)
            ->where('start_time', '<=', $currentTime)
            ->where('end_time', '>=', $currentTime)
            ->orderBy('start_time');
    }
}
