import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const NODE_COUNT = 240;
const EDGE_PAIRS = 96;
const SPREAD = 16;

function ConstellationNodes() {
  const ref = useRef<THREE.Points>(null!);

  const geometry = useMemo(() => {
    const arr = new Float32Array(NODE_COUNT * 3);
    for (let i = 0; i < NODE_COUNT; i++) {
      arr[i * 3] = (Math.random() - 0.5) * SPREAD;
      arr[i * 3 + 1] = (Math.random() - 0.5) * SPREAD;
      arr[i * 3 + 2] = (Math.random() - 0.5) * SPREAD * 0.45;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return geo;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!ref.current) return;
    ref.current.rotation.y = t * 0.016;
    ref.current.rotation.x = Math.sin(t * 0.11) * 0.12;
  });

  return (
    <points ref={ref} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        transparent
        color="#31c4ff"
        size={0.05}
        sizeAttenuation
        depthWrite={false}
        opacity={0.55}
      />
    </points>
  );
}

function ConstellationEdges() {
  const ref = useRef<THREE.LineSegments>(null!);

  const geometry = useMemo(() => {
    const points: number[] = [];
    for (let i = 0; i < EDGE_PAIRS; i++) {
      const ax = (Math.random() - 0.5) * SPREAD;
      const ay = (Math.random() - 0.5) * SPREAD;
      const az = (Math.random() - 0.5) * SPREAD * 0.45;
      const bx = ax + (Math.random() - 0.5) * 4.2;
      const by = ay + (Math.random() - 0.5) * 4.2;
      const bz = az + (Math.random() - 0.5) * 0.9;
      points.push(ax, ay, az, bx, by, bz);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return geo;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!ref.current) return;
    ref.current.rotation.y = t * 0.016;
    ref.current.rotation.x = Math.sin(t * 0.11) * 0.12;
    const material = ref.current.material as THREE.LineBasicMaterial;
    material.opacity = 0.1 + Math.sin(t * 0.7) * 0.03;
  });

  return (
    <lineSegments ref={ref} geometry={geometry}>
      <lineBasicMaterial color="#31c4ff" transparent opacity={0.12} depthWrite={false} />
    </lineSegments>
  );
}

function PacketTrails() {
  const ref = useRef<THREE.Group>(null!);

  const packets = useMemo(
    () =>
      Array.from({ length: 8 }).map((_, i) => ({
        orbit: 1.8 + i * 0.44,
        speed: 0.25 + i * 0.035,
        offset: i * 0.85,
        height: (Math.random() - 0.5) * 3,
      })),
    []
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!ref.current) return;

    ref.current.children.forEach((child, i) => {
      const packet = packets[i];
      const a = t * packet.speed + packet.offset;
      child.position.set(Math.cos(a) * packet.orbit, packet.height + Math.sin(a * 0.8) * 0.6, Math.sin(a) * packet.orbit * 0.35);
      child.scale.setScalar(0.75 + (Math.sin(a * 2.5) + 1) * 0.2);
    });
  });

  return (
    <group ref={ref}>
      {packets.map((_, idx) => (
        <mesh key={idx}>
          <sphereGeometry args={[0.04, 10, 10]} />
          <meshBasicMaterial color={idx % 2 === 0 ? "#31c4ff" : "#8594ff"} transparent opacity={0.92} />
        </mesh>
      ))}
    </group>
  );
}

function RadarHalo() {
  const ref = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!ref.current) return;
    const phase = (t * 0.2) % 1;
    const scale = 1 + phase * 8;
    ref.current.scale.setScalar(scale);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * 0.11;
  });

  return (
    <mesh ref={ref} position={[0, 0, 0]}>
      <ringGeometry args={[0.9, 1.08, 64]} />
      <meshBasicMaterial color="#31c4ff" transparent opacity={0.12} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function NetworkBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 10], fov: 54 }}
        gl={{ antialias: false, alpha: true }}
        style={{ background: "transparent" }}
        dpr={[1, 1.5]}
      >
        <ConstellationNodes />
        <ConstellationEdges />
        <PacketTrails />
        <RadarHalo />
      </Canvas>
    </div>
  );
}
