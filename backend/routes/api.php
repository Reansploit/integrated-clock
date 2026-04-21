<?php

use App\Http\Controllers\Api\DisplayStateController;
use App\Http\Controllers\Api\EventController;
use App\Http\Controllers\Api\MediaAssetController;
use App\Http\Controllers\Api\MufrodatController;
use App\Http\Controllers\Api\PrayerTimeController;
use App\Http\Controllers\Api\SettingController;
use Illuminate\Support\Facades\Route;

Route::get('/display/state', [DisplayStateController::class, 'index']);
Route::get('/prayer-times/today', [PrayerTimeController::class, 'today']);
Route::post('/prayer-times/offsets', [PrayerTimeController::class, 'updateOffsets']);

Route::apiResource('/events', EventController::class)->except(['show']);
Route::post('/events/import', [EventController::class, 'import']);

Route::apiResource('/mufrodat', MufrodatController::class)->except(['show']);
Route::apiResource('/media-assets', MediaAssetController::class)->except(['show', 'update']);

Route::post('/settings', [SettingController::class, 'upsert']);
