<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Mufrodat extends Model
{
    protected $fillable = [
        'arabic_word',
        'translation',
        'sort_order',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
