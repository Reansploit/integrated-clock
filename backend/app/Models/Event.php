<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Event extends Model
{
    protected $fillable = [
        'title',
        'description',
        'event_date',
        'start_time',
        'end_time',
        'is_active',
    ];

    protected $casts = [
        'event_date' => 'date',
        'is_active' => 'boolean',
    ];

    public function scopeActiveNow(Builder $query, string $currentDate, string $currentTime): Builder
    {
        return $query->where('is_active', true)
            ->where(function (Builder $q) use ($currentDate) {
                $q->whereNull('event_date')->orWhere('event_date', $currentDate);
            })
            ->where('start_time', '<=', $currentTime)
            ->where('end_time', '>=', $currentTime);
    }
}
