<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Event;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EventController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Event::query()->orderByDesc('event_date')->orderBy('start_time')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'event_date' => 'nullable|date',
            'start_time' => 'required|date_format:H:i',
            'end_time' => 'required|date_format:H:i|after:start_time',
            'is_active' => 'sometimes|boolean',
        ]);

        return response()->json(Event::query()->create($validated), 201);
    }

    public function update(Request $request, Event $event): JsonResponse
    {
        $validated = $request->validate([
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'event_date' => 'nullable|date',
            'start_time' => 'sometimes|date_format:H:i',
            'end_time' => 'sometimes|date_format:H:i',
            'is_active' => 'sometimes|boolean',
        ]);

        $event->update($validated);
        return response()->json($event);
    }

    public function destroy(Event $event): JsonResponse
    {
        $event->delete();
        return response()->json([], 204);
    }

    public function import(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'events' => 'required|array',
            'events.*.title' => 'required|string|max:255',
            'events.*.start_time' => 'required|date_format:H:i',
            'events.*.end_time' => 'required|date_format:H:i',
            'events.*.event_date' => 'nullable|date',
            'events.*.description' => 'nullable|string',
        ]);

        foreach ($payload['events'] as $item) {
            Event::query()->create($item);
        }

        return response()->json(['message' => 'Events imported']);
    }
}
