import { A11yTreeElement } from "@astralarium/a11y-tree";
import { useEffect, useRef, useState } from "react";

interface FocusableCubeProps {
  label: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  size?: number;
}

/**
 * Cube wired for pointer and keyboard interaction.
 *
 * Hovering focuses its element in the a11y tree;
 * focus (pointer or Tab) highlights the cube.
 */
export function FocusableCube({
  label,
  position,
  rotation,
  size = 1.5,
}: FocusableCubeProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
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
        scale={focused ? 1.15 : 1}
        onPointerEnter={() => {
          setHovered(true);
          buttonRef.current?.focus();
        }}
        onPointerLeave={() => {
          setHovered(false);
          buttonRef.current?.blur();
        }}
      >
        <boxGeometry args={[size, size, size]} />
        <meshStandardMaterial
          color={focused ? "#34d399" : hovered ? "#7dd3fc" : "#38bdf8"}
        />
      </mesh>
      <A11yTreeElement>
        <button
          ref={buttonRef}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="rounded border border-neutral-600 px-3 py-1 focus:border-emerald-400 focus:text-emerald-300 focus:outline-none"
        >
          {label}
        </button>
      </A11yTreeElement>
    </>
  );
}
