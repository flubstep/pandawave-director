import { GUI } from 'dat.gui';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

import { useActionStore } from '@renderer/stores/actionsStore';

import CarGlb from '../assets/chrysler_pacifica.glb?url';
import { DEFAULT_PANEL_WIDTH, VIDEO_ASPECT_RATIO } from '../constants';
import { usePlaybackStore } from '../stores/playbackStore';
import { useSceneStore } from '../stores/sceneStore';
import {
  CameraPose,
  loadCameraPositions,
  loadJsonUrl,
  loadLidarFrames,
  PandaScene,
} from './loaders';

function loadCar(): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      CarGlb,
      (loadedModel) => {
        loadedModel.scene.traverseVisible((object) => {
          if (object.material) {
            object.material = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
          }
        });
        resolve(loadedModel.scenes[0]);
      },
      undefined,
      (error) => reject(error),
    );
  });
}

function getTrackPoseAt(timestamps: number[], poses: CameraPose[], dt: number): CameraPose {
  for (let ii = 0; ii < timestamps.length - 1; ii++) {
    const t1 = timestamps[ii] - timestamps[0];
    const t2 = timestamps[ii + 1] - timestamps[0];
    if (t1 <= dt && dt < t2) {
      const p1 = poses[ii].position;
      const p2 = poses[ii + 1].position;
      const fraction = (dt - t1) / (t2 - t1);
      const position = new THREE.Vector3();
      position.lerpVectors(p1, p2, fraction);
      return {
        position,
        heading: poses[ii].heading,
      };
    }
  }
  return poses[poses.length - 1];
}

const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;

type TeardownFunction = () => void;

function currentTimeString() {
  const d = new Date();
  const YY = d.getFullYear();
  const MM = d.getMonth().toString().padStart(2, '0');
  const DD = d.getDate().toString().padStart(2, '0');
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${YY}-${MM}-${DD} ${hh}.${mm}.${ss}`;
}

export async function setupThreeScene(
  container: HTMLDivElement,
  guiContainer: HTMLDivElement,
): Promise<TeardownFunction> {
  const width = window.innerWidth - DEFAULT_PANEL_WIDTH;
  const height = width / VIDEO_ASPECT_RATIO;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, VIDEO_ASPECT_RATIO, 0.1, 1000);
  camera.up.set(0, 0, 1);
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const recordingRenderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
  recordingRenderer.setSize(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  recordingRenderer.setPixelRatio(1);

  async function loadPandaScene(name: string): Promise<void> {
    if (pandaScene) {
      scene.remove(pandaScene.frames);
    }
    const frameBaseUrl = `http://localhost:8080/pandaset_0/${name}`;
    const timestamps = await loadJsonUrl<number[]>(frameBaseUrl + `/meta/timestamps.json`); // timestamps are in seconds
    const poses = await loadCameraPositions(frameBaseUrl + '/camera/front_camera/poses.json');
    const frames = await loadLidarFrames({
      scene: name,
      timestamps,
      positions: poses.map((p) => p.position),
    });
    scene.add(frames);
    const { setPlaying, setDuration, setTimestamp } = usePlaybackStore.getState();
    const duration = timestamps[timestamps.length - 1] - timestamps[0];
    setPlaying(true);
    setTimestamp(0.0);
    setDuration(duration);
    pandaScene = {
      name,
      timestamps,
      poses,
      frames,
      duration,
    };
  }
  async function unloadPandaScene(): Promise<void> {
    if (!pandaScene) {
      return;
    }
    scene.remove(pandaScene.frames);
    pandaScene = null;
  }

  const car = await loadCar();
  car.rotation.x = -Math.PI / 2;
  scene.add(car);
  camera.position.set(8, 8, 2);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.object.up.set(0, 0, 1);
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };

  let animationPointer: number | null = null;
  let pandaScene: PandaScene | null = null;

  useSceneStore.subscribe((state) => {
    const { sceneName } = state;
    if (sceneName !== null && sceneName !== pandaScene?.name) {
      loadPandaScene(sceneName);
    } else if (state.sceneName === null && pandaScene !== null) {
      unloadPandaScene();
    }
  });

  const params: {
    framesPerMinute: number;
    followCar: boolean;
    followVectorEnabled: boolean;
    followVector: THREE.Vector3 | null;
    autoRotate: boolean;
    autoRotateSpeed: number;
  } = {
    framesPerMinute: 95,
    followCar: false,
    followVectorEnabled: false,
    followVector: null,
    autoRotate: false,
    autoRotateSpeed: 0.5,
  };
  const shaderParams = {
    zMin: -2.0,
    zMax: 5.0,
    lidarSpeed: 120.0,
    decayTime: 0.15,
  };

  function renderPandaScene(dt: number) {
    if (!pandaScene) {
      return;
    }
    const { timestamp, setTimestamp } = usePlaybackStore.getState();
    const { frames, poses, timestamps, duration } = pandaScene;
    const framesPerSecond = params.framesPerMinute / 60;
    const timeScale = framesPerSecond * 0.1;
    setTimestamp((timestamp + dt * timeScale) % duration);

    // TODO: Make cleaner
    const timeDelta = usePlaybackStore.getState().timestamp;

    for (const frame of frames.children) {
      frame.material.uniforms.timeDelta.value = timeDelta;
    }
    const pose = getTrackPoseAt(timestamps, poses, timeDelta);
    car.position.set(pose.position.x, pose.position.y, pose.position.z);
    car.rotation.setFromQuaternion(pose.heading);
  }

  function updateCameraControls(playing: boolean) {
    if (playing) {
      if (params.followVectorEnabled && params.followVector) {
        camera.position.copy(car.position);
        camera.position.add(params.followVector);
      }
      if (params.followCar) {
        controls.target = car.position.clone();
      }
      controls.update();
    } else if (params.followVectorEnabled) {
      params.followVector = camera.position.clone();
      params.followVector.sub(car.position);
    }
  }

  const clock = new THREE.Clock();
  function animate(): void {
    const dt = clock.getDelta();
    animationPointer = requestAnimationFrame(animate);
    renderer.render(scene, camera);
    const { playing } = usePlaybackStore.getState();
    renderPandaScene(playing ? dt : 0.0);
    updateCameraControls(playing);
  }

  async function record(filename?: string): Promise<void> {
    const { setPlaying, setRecording, setTimestamp } = usePlaybackStore.getState();
    if (!pandaScene) {
      return;
    }
    if (!filename) {
      filename = `Video Capture of PandaSet_${pandaScene.name} at ${currentTimeString()}.mp4`;
    }
    setPlaying(false);
    setRecording(true);
    setTimestamp(0.0);
    let lastTimestamp = 0.0;
    let frameIndex = 0;
    // Loop until we cycle back to the start again.
    window.api.videoStart(filename);
    while (usePlaybackStore.getState().timestamp >= lastTimestamp) {
      controls.update();
      lastTimestamp = usePlaybackStore.getState().timestamp;
      renderPandaScene(0.016);
      updateCameraControls(true);
      const dataUrl = getCanvasDataUrl();
      window.api.videoAddFrame(dataUrl);
      frameIndex += 1;
      if (frameIndex % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    window.api.videoStop();
    setRecording(false);
  }

  function updateUniforms(): void {
    if (!pandaScene) {
      return;
    }
    const { frames } = pandaScene;
    for (const frame of frames.children) {
      frame.material.uniforms.zMin.value = shaderParams.zMin;
      frame.material.uniforms.zMax.value = shaderParams.zMax;
      frame.material.uniforms.lidarSpeed.value = shaderParams.lidarSpeed;
      frame.material.uniforms.decayTime.value = shaderParams.decayTime;
    }
  }
  updateUniforms();

  window.addEventListener('resize', () => {
    const width = window.innerWidth - DEFAULT_PANEL_WIDTH;
    const height = width / VIDEO_ASPECT_RATIO;
    renderer.setSize(width, height);
    camera.aspect = width / height;
  });

  function getCanvasDataUrl() {
    recordingRenderer.render(scene, camera);
    const canvas = recordingRenderer.domElement;
    return canvas.toDataURL('image/png');
  }

  async function screenshot(filename?: string) {
    if (!filename) {
      filename = `Canvas Screenshot at ${currentTimeString()}.png`;
    }
    const dataUrl = getCanvasDataUrl();
    window.api.saveImage(dataUrl, filename);
  }

  const gui = new GUI({ autoPlace: false });
  gui.width = DEFAULT_PANEL_WIDTH;

  const cameraGui = gui.addFolder('Camera Options');
  cameraGui.add(params, 'framesPerMinute', 10, 200, 1.0).name('BPM');
  cameraGui.add(params, 'followCar').name('Follow: Rotate Camera');
  cameraGui
    .add(params, 'followVectorEnabled')
    .name('Follow: Maintain Camera Distance')
    .onChange(() => {
      params.followVector = camera.position.clone();
      params.followVector.sub(car.position);
    });
  cameraGui
    .add(params, 'autoRotate')
    .name('Auto-Rotate')
    .onChange((value: boolean) => {
      controls.autoRotate = value;
    });
  cameraGui
    .add(params, 'autoRotateSpeed', 0.0, 2.0, 0.01)
    .name('Auto-Rotate Speed')
    .onChange((value: number) => {
      controls.autoRotateSpeed = value;
    });

  cameraGui.open();
  const shaderGui = gui.addFolder('Shader Options');
  shaderGui.add(shaderParams, 'zMin', -10.0, 10.0, 0.1).name('Z-Floor').onChange(updateUniforms);
  shaderGui.add(shaderParams, 'zMax', -10.0, 10.0, 0.1).name('Z-Ceiling').onChange(updateUniforms);
  shaderGui
    .add(shaderParams, 'lidarSpeed', 1.0, 200.0, 1.0)
    .name('Lidar Speed')
    .onChange(updateUniforms);
  shaderGui
    .add(shaderParams, 'decayTime', 0.0, 1.0, 0.01)
    .name('Decay Time (s)')
    .onChange(updateUniforms);
  shaderGui.open();
  guiContainer.appendChild(gui.domElement);

  animate();

  useActionStore.getState().setScreenshotFunction(screenshot);
  useActionStore.getState().setRecordFunction(record);

  function teardown() {
    if (animationPointer) {
      cancelAnimationFrame(animationPointer);
    }
    guiContainer.removeChild(gui.domElement);
    container.removeChild(renderer.domElement);
    renderer.dispose();
  }
  return teardown;
}
