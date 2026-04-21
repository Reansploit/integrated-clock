<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MediaAsset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class MediaAssetController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(MediaAsset::query()->latest()->get());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => 'required|string|in:boot_video,background_image,background_video,scheduled_video',
            'title' => 'nullable|string|max:255',
            'media' => 'required|file|mimes:mp4,jpg,jpeg,png,webm|max:102400',
            'duration_seconds' => 'nullable|integer|min:1|max:3600',
            'start_time' => 'nullable|date_format:H:i',
            'end_time' => 'nullable|date_format:H:i',
            'is_active' => 'sometimes|boolean',
        ]);

        $path = $request->file('media')->store('signage', 'public');
        $media = MediaAsset::query()->create([
            ...$validated,
            'path' => Storage::disk('public')->url($path),
            'mime_type' => $request->file('media')->getMimeType(),
        ]);

        return response()->json($media, 201);
    }

    public function destroy(MediaAsset $mediaAsset): JsonResponse
    {
        $mediaAsset->delete();
        return response()->json([], 204);
    }
}
