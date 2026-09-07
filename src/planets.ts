export type Vec3 = [number, number, number];
export type Atmosphere = { day: Vec3; night: Vec3; twilight: Vec3; intensity: number; falloff: number; shell: number };
export type Moon = { id: string; name: string; tex: string; size: number; spin: number; tint?: Vec3 };
export type Body = {
  id: string; name: string; blurb: string;
  dir: string;
  tex: { day: string; night?: string; normal?: string; specular?: string; clouds?: string };
  spin: number;            // visual deg/s
  tilt: number;            // deg
  exposure: number;
  atmosphere?: Atmosphere;
  sky?: "earth" | "venus"; // earth: translucent satellite clouds; venus: opaque cloud deck that can be hidden
  cloudDrift?: number;
  rings?: { inner: number; outer: number; tex: string };
  bands?: number;          // gas-giant differential flow strength
  cityLights?: boolean;
  ocean?: boolean;
  moons?: Moon[];
};

const P = "/textures/planets/";
export const BODIES: Body[] = [
  {
    id: "mercury", name: "Mercury", blurb: "airless, cratered, 430 °C by day and −180 °C by night", dir: P,
    tex: { day: "8k_mercury.jpg" }, spin: 0.35, tilt: 0.03, exposure: 1.25,
  },
  {
    id: "venus", name: "Venus", blurb: "a runaway greenhouse under a cloud deck that spins faster than the planet", dir: P,
    tex: { day: "8k_venus_surface.jpg", clouds: "4k_venus_atmosphere.jpg" }, spin: -0.25, tilt: 2.6, exposure: 0.95,
    sky: "venus", cloudDrift: 0.0015,
    atmosphere: { day: [1.0, 0.86, 0.6], night: [0.25, 0.18, 0.1], twilight: [1.0, 0.6, 0.25], intensity: 0.9, falloff: 0.3, shell: 1.09 },
  },
  {
    id: "earth", name: "Earth", blurb: "a living earth, rendered in real time", dir: "/textures/16k/",
    tex: { day: "day.jpg", night: "night.jpg", normal: "normal.jpg", specular: "specular.jpg", clouds: "../8k/8k_earth_clouds.jpg" },
    spin: 1.5, tilt: 23.4, exposure: 1.1, sky: "earth", cloudDrift: 0.0003, cityLights: true, ocean: true,
    atmosphere: { day: [0.30, 0.58, 1.0], night: [0.05, 0.08, 0.24], twilight: [1.0, 0.45, 0.15], intensity: 0.7, falloff: 0.22, shell: 1.12 },
    moons: [{ id: "moon", name: "Moon", tex: P + "8k_moon.jpg", size: 0.27, spin: 0.25 }],
  },
  {
    id: "mars", name: "Mars", blurb: "cold desert world with the tallest volcano and deepest canyon in the solar system", dir: P,
    tex: { day: "8k_mars.jpg" }, spin: 1.45, tilt: 25.2, exposure: 1.15,
    atmosphere: { day: [0.95, 0.62, 0.42], night: [0.12, 0.07, 0.05], twilight: [0.55, 0.6, 0.85], intensity: 0.32, falloff: 0.18, shell: 1.06 },
  },
  {
    id: "jupiter", name: "Jupiter", blurb: "a gas giant with a storm larger than Earth that has raged for centuries", dir: P,
    tex: { day: "8k_jupiter.jpg" }, spin: 3.6, tilt: 3.1, exposure: 1.05, bands: 1.0,
    atmosphere: { day: [0.85, 0.78, 0.65], night: [0.08, 0.07, 0.06], twilight: [0.9, 0.6, 0.35], intensity: 0.25, falloff: 0.2, shell: 1.05 },
    moons: [
      { id: "io", name: "Io", tex: P + "moons/io.jpg", size: 0.22, spin: 0.4 },
      { id: "europa", name: "Europa", tex: P + "moons/europa.jpg", size: 0.2, spin: 0.35 },
      { id: "ganymede", name: "Ganymede", tex: P + "moons/ganymede.jpg", size: 0.28, spin: 0.3 },
      { id: "callisto", name: "Callisto", tex: P + "moons/callisto.jpg", size: 0.26, spin: 0.25, tint: [1.7, 1.65, 1.55] },
    ],
  },
  {
    id: "saturn", name: "Saturn", blurb: "rings of ice and rock, wide enough to span two thirds of the Earth–Moon distance", dir: P,
    tex: { day: "8k_saturn.jpg" }, spin: 3.4, tilt: 26.7, exposure: 1.05, bands: 0.5,
    atmosphere: { day: [0.9, 0.82, 0.62], night: [0.08, 0.07, 0.05], twilight: [0.95, 0.65, 0.35], intensity: 0.22, falloff: 0.2, shell: 1.05 },
    rings: { inner: 1.24, outer: 2.27, tex: P + "8k_saturn_ring_alpha.png" },
    moons: [
      { id: "titan", name: "Titan", tex: P + "moons/titan.jpg", size: 0.27, spin: 0.3, tint: [1.0, 0.8, 0.5] },
      { id: "enceladus", name: "Enceladus", tex: P + "moons/enceladus.jpg", size: 0.16, spin: 0.4 },
      { id: "rhea", name: "Rhea", tex: P + "moons/rhea.jpg", size: 0.18, spin: 0.35 },
    ],
  },
];
export const byId = (id: string) => BODIES.find((b) => b.id === id);
