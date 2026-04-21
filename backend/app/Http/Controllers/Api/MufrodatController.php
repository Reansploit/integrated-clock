<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Mufrodat;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MufrodatController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Mufrodat::query()->orderBy('sort_order')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'arabic_word' => 'required|string|max:255',
            'translation' => 'required|string|max:255',
            'sort_order' => 'sometimes|integer|min:0',
            'is_active' => 'sometimes|boolean',
        ]);

        return response()->json(Mufrodat::query()->create($validated), 201);
    }

    public function update(Request $request, Mufrodat $mufrodat): JsonResponse
    {
        $validated = $request->validate([
            'arabic_word' => 'sometimes|string|max:255',
            'translation' => 'sometimes|string|max:255',
            'sort_order' => 'sometimes|integer|min:0',
            'is_active' => 'sometimes|boolean',
        ]);

        $mufrodat->update($validated);
        return response()->json($mufrodat);
    }

    public function destroy(Mufrodat $mufrodat): JsonResponse
    {
        $mufrodat->delete();
        return response()->json([], 204);
    }
}
