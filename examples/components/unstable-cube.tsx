import { A11yTreeElement } from "@astralarium/a11y-tree";
import { type Ref, useEffect, useRef, useState } from "react";

interface UnstableCubeProps {
  label: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  size?: number;
}

/**
 * Cube whose a11y tree element throws during render when activated.
 *
 * Clicking the cube (or its button in the a11y tree) crashes the
 * tree, demonstrating the error boundary's breakout dialog. The
 * crashed state lives in the tunneled button, so dismissing the
 * dialog remounts it fresh and the tree recovers.
 */
export function UnstableCube({
  label,
  position,
  rotation,
  size = 1.5,
}: UnstableCubeProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  return (
    <>
      <mesh
        position={position}
        rotation={rotation}
        scale={hovered ? 1.15 : 1}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onClick={() => buttonRef.current?.click()}
      >
        <boxGeometry args={[size, size, size]} />
        <meshStandardMaterial color={hovered ? "#fca5a5" : "#f87171"} />
      </mesh>
      <A11yTreeElement>
        <DetonatorButton ref={buttonRef} label={label} />
      </A11yTreeElement>
    </>
  );
}

function DetonatorButton({
  ref,
  label,
}: {
  ref: Ref<HTMLButtonElement>;
  label: string;
}) {
  const [detonated, setDetonated] = useState(false);
  if (detonated) {
    throw new Error(`${label} crashed while rendering`);
  }
  return (
    <button
      ref={ref}
      onClick={() => setDetonated(true)}
      className="w-full rounded border border-red-400 px-3 py-1 text-red-300 focus:outline-none focus-visible:border-red-200"
    >
      {label}
    </button>
  );
}
