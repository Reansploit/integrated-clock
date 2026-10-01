'use client';

type WeatherBadgeProps = {
  temp: number | null;
};

export function WeatherBadge({ temp }: WeatherBadgeProps) {
  if (temp === null) {
    return null;
  }

  return (
    <div className="weather-badge">
      <span className="weather-badge__temp">{temp}°C</span>
    </div>
  );
}
