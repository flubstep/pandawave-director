import _ from 'lodash';
import * as THREE from 'three';

import FRAGMENT_SHADER from './shaders/fragment.glsl';
import VERTEX_SHADER from './shaders/vertex.glsl';

export interface GpsPosition {
  lat: number;
  long: number;
  height: number;
  xvel: number;
  yvel: number;
}

export interface WorldPosition extends GpsPosition {
  world: THREE.Vector3;
}

export interface CameraPose {
  position: {
    x: number;
    y: number;
    z: number;
  };
  heading: {
    x: number;
    y: number;
    z: number;
    w: number;
  };
}

export interface PandaScene {
  name: string;
  frames: THREE.Group;
  positions: THREE.Vector3[];
  timestamps: number[];
}

export async function loadJsonUrl<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const json = await response.json();
  return json;
}

export async function loadGpsPositions(url: string): Promise<WorldPosition[]> {
  const positions = await loadJsonUrl<GpsPosition[]>(url);
  const latlongToMeters = 111139;
  const positionZero = positions[0];
  const worldPositions = positions.map((position) => ({
    ...position,
    world: new THREE.Vector3(
      (position.lat - positionZero.lat) * latlongToMeters,
      (position.long - positionZero.long) * latlongToMeters,
      position.height - positionZero.height,
    ),
  }));
  return worldPositions;
}

export async function loadCameraPositions(url: string): Promise<THREE.Vector3[]> {
  const poses = await loadJsonUrl<CameraPose[]>(url);
  return poses.map((pose) => new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z));
}

export async function loadLidarFrames({
  scene,
  timestamps,
  positions,
}: {
  scene: string;
  timestamps: number[];
  positions: THREE.Vector3[];
}): Promise<THREE.Group> {
  const frameBaseUrl = `http://localhost:8080/pandaset_0/${scene}`;
  const frameNumbers = timestamps.map((_, n) => String(n).padStart(2, '0'));
  const group = new THREE.Group();
  for (const [frameNumber, timestamp, position] of _.zip(frameNumbers, timestamps, positions)) {
    if (!timestamp || !position) {
      continue;
    }
    const timestampZero = timestamps[0];
    const deltaPosition = position;
    const url = frameBaseUrl + `/lidar_bin/${frameNumber}.bin`;
    const frame = await loadFrame({
      url,
      timestamp: timestamp - timestampZero,
      origin: deltaPosition,
    });
    group.add(frame);
  }
  return group;
}

export async function loadFrame({
  url,
  timestamp,
  origin,
}: {
  url: string;
  timestamp: number;
  origin: THREE.Vector3;
}): Promise<THREE.Object3D> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const vertices = new Float32Array(buffer);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      size: { value: 4.0 },
      zMin: { value: -2.0 },
      zMax: { value: 5.0 },
      timeStart: { value: timestamp },
      timeDelta: { value: 0.0 },
      lidarOrigin: { value: origin },
      lidarSpeed: { value: 120.0 },
      decayTime: { value: 0.15 },
    },
    transparent: true,
  });
  const mesh = new THREE.Points(geometry, material);
  return mesh;
}
