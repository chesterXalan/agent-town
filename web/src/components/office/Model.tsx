import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import { Box3, Vector3, type Object3D } from 'three'
import type { Vec3 } from '@/lib/office/layout'

export const MODEL_DIR = '/office/models/'

export function preloadModels(files: Iterable<string>) {
  for (const f of new Set(files)) useGLTF.preload(MODEL_DIR + f)
}

/** clone 出來的物件設陰影旗標（只設旗標，geometry／material 仍共用） */
export function withShadows<T extends Object3D>(obj: T, castShadow = true, receiveShadow = true): T {
  obj.traverse((o) => {
    o.castShadow = castShadow
    o.receiveShadow = receiveShadow
  })
  return obj
}

export interface ModelProps {
  /** models/ 下的檔名，例 'desk.glb' */
  file: string
  position?: Vec3
  rotationY?: number
  scale?: number | Vec3
  /** 地毯這類貼地的不投影 */
  castShadow?: boolean
}

/**
 * Kenney 模型：scene.clone()（geometry／material 共用，只設陰影旗標）；
 * 俯視外框中心對齊 position、底部貼 y（Kenney 家具原點多在角落）。
 * 未旋轉時 Kenney 家具正面朝 local +z。
 */
export function Model({ file, position = [0, 0, 0], rotationY = 0, scale = 1, castShadow = true }: ModelProps) {
  const { scene } = useGLTF(MODEL_DIR + file)
  const { object, offset } = useMemo(() => {
    const o = withShadows(scene.clone(), castShadow)
    const box = new Box3().setFromObject(o)
    const c = box.getCenter(new Vector3())
    return { object: o, offset: [-c.x, -box.min.y, -c.z] as Vec3 }
  }, [scene, castShadow])
  return (
    <group position={position} rotation-y={rotationY} scale={scale}>
      <primitive object={object} position={offset} />
    </group>
  )
}
