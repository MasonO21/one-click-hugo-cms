/**
 * Renderer — three.js presentation layer. Reads game.state / game.derived / game.view every frame and
 * listens to game.bus for VFX. Never mutates game.state.
 *
 * OWNER: render agent. (This file is a minimal placeholder so the app boots.)
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Selection } from '../core/view';
import type { RendererApi, ScreenPoint } from './api';

export class Renderer implements RendererApi {
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.5, 1500);
  private player!: THREE.Mesh;
  private ground!: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private fps = 60;

  constructor(private readonly game: Game) {}

  init(container: HTMLElement): void {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#9fd3ff');
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#557744', 1.2));
    const sun = new THREE.DirectionalLight('#fff3d6', 1.5);
    sun.position.set(50, 80, 30);
    this.scene.add(sun);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(512, 512).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#7cc35f' }));
    this.scene.add(this.ground);
    this.player = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.9, 4, 8), new THREE.MeshLambertMaterial({ color: '#ff8a3d' }));
    this.scene.add(this.player);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(dt: number): void {
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    const p = this.game.state.player;
    this.player.position.set(p.x, 0.85, p.z);
    const cam = this.game.view.camera;
    const dist = 14 + cam.zoom * 40;
    this.camera.position.set(p.x + Math.sin(cam.yaw) * dist, dist * 0.9, p.z + Math.cos(cam.yaw) * dist);
    this.camera.lookAt(p.x, 0, p.z);
    this.renderer.render(this.scene, this.camera);
  }

  pickGround(sx: number, sy: number): { x: number; z: number } | null {
    const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.ground)[0];
    return hit ? { x: hit.point.x, z: hit.point.z } : null;
  }

  pick(_sx: number, _sy: number): Selection | null {
    return null;
  }

  worldToScreen(x: number, y: number, z: number): ScreenPoint {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, visible: v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
  }

  cameraYaw(): number {
    return this.game.view.camera.yaw;
  }

  focus(x: number, z: number): void {
    this.game.view.camera.tx = x;
    this.game.view.camera.tz = z;
  }

  stats() {
    const info = this.renderer.info.render;
    return { fps: Math.round(this.fps), drawCalls: info.calls, triangles: info.triangles };
  }
}
