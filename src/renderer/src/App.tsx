import { useEffect, useRef, useState } from 'react';

import _ from 'lodash';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import { Box, Button, ChakraProvider, DarkMode, extendTheme, Text } from '@chakra-ui/react';

import FRAGMENT_SHADER from './shaders/fragment.glsl';
import VERTEX_SHADER from './shaders/vertex.glsl';

const DEFAULT_PANEL_WIDTH = 240;
const VIDEO_ASPECT_RATIO = 16 / 9;

interface GpsPosition {
  lat: number;
  long: number;
  height: number;
  xvel: number;
  yvel: number;
}

async function loadJsonUrl<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const json = await response.json();
  return json;
}

async function loadLidarFrames(frameId: string): Promise<THREE.Group> {
  const frameBaseUrl = `http://localhost:8080/pandaset_0/${frameId}`;
  const timestamps = await loadJsonUrl<number[]>(frameBaseUrl + `/meta/timestamps.json`);
  const positions = await loadJsonUrl<GpsPosition[]>(frameBaseUrl + `/meta/gps.json`);
  const frameNumbers = timestamps.map((_, n) => String(n).padStart(2, '0'));
  const timeScale = 20000.0;

  const latlongToMeters = 111139;

  const group = new THREE.Group();
  for (const [frameNumber, timestamp, position] of _.zip(frameNumbers, timestamps, positions)) {
    if (!timestamp || !position) {
      continue;
    }
    const timestampZero = timestamps[0];
    const positionZero = positions[0];
    const deltaPosition = new THREE.Vector3(
      (position.lat - positionZero.lat) * latlongToMeters,
      (position.long - positionZero.long) * latlongToMeters,
      position.height - positionZero.height,
    );
    const url = frameBaseUrl + `/lidar_bin/${frameNumber}.bin`;
    const frame = await loadFrame({
      url,
      timestamp: (timestamp - timestampZero) * timeScale,
      origin: deltaPosition,
    });
    group.add(frame);
  }
  return group;
}

async function loadFrame({
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
      timeStart: { value: timestamp / 1000.0 },
      timeDelta: { value: 0.0 },
      lidarOrigin: { value: origin },
      lidarSpeed: { value: 30.0 },
      decayTime: { value: 2.0 },
    },
    transparent: true,
  });
  const mesh = new THREE.Points(geometry, material);
  return mesh;
}

async function setupThreeScene(container: HTMLDivElement): Promise<() => void> {
  const width = window.innerWidth - DEFAULT_PANEL_WIDTH;
  const height = width / VIDEO_ASPECT_RATIO;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  camera.up.set(0, 0, 1);
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  const light = new THREE.PointLight(0xffffff, 1);
  light.position.set(0, 0, 5);
  const light2 = new THREE.PointLight(0xffffff, 0.5);
  light2.position.set(0, 5, 0);
  const light3 = new THREE.AmbientLight(0xffffff, 0.1);
  scene.add(light, light2, light3);

  camera.position.z = 5;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.object.up.set(0, 0, 1);
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };

  const frames = await loadLidarFrames('001');
  scene.add(frames);

  let animationPointer: number | null = null;

  function animate(timeMs: number): void {
    animationPointer = requestAnimationFrame(animate);
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
    renderer.render(scene, camera);
    for (const frame of frames.children) {
      frame.material.uniforms.timeDelta.value = (timeMs / 1000.0) % 20.0;
    }
  }

  window.addEventListener('resize', () => {
    const width = window.innerWidth - DEFAULT_PANEL_WIDTH;
    const height = width / VIDEO_ASPECT_RATIO;
    renderer.setSize(width, height);
    camera.aspect = width / height;
  });

  animate(0.0);
  return () => {
    if (animationPointer) {
      cancelAnimationFrame(animationPointer);
    }
    container.removeChild(renderer.domElement);
    renderer.dispose();
  };
}

const config = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
};

const theme = extendTheme({ config });

function App(): JSX.Element {
  const [panelWidth] = useState<number>(DEFAULT_PANEL_WIDTH);
  const canvasContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (canvasContainer.current) {
      const teardownPromise = setupThreeScene(canvasContainer.current);
      return async () => {
        const teardownFn = await teardownPromise;
        teardownFn();
      };
    }
    return () => {};
  }, [canvasContainer]);

  return (
    <ChakraProvider theme={theme}>
      <DarkMode>
        <Box h="100vh" w="100vw" display="flex">
          <Box
            w={panelWidth}
            display="flex"
            bg="gray.900"
            borderRight="1px solid #333"
            flexDirection="column"
            p={4}
          >
            <Button colorScheme="blue">Load Frames</Button>
          </Box>
          <Box
            flexGrow={1}
            bgColor="gray.900"
            ref={canvasContainer}
            display="flex"
            flexDirection="column-reverse"
          >
            <Box flexGrow={1} borderTop="1px solid #333">
              <Text>Hey, lien</Text>
            </Box>
          </Box>
        </Box>
      </DarkMode>
    </ChakraProvider>
  );
}

export default App;
