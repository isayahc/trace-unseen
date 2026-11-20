import * as THREE from "three";
import { ColladaLoader } from "three/examples/jsm/loaders/ColladaLoader.js";

export type FactoryAsset = { id: string; url: string; position: number[]; size: number[]; rotation: number; source: string; role: string };

export function factoryAssetLoader(manager: THREE.LoadingManager) {
  const loader = new ColladaLoader(manager);
  const cache = new Map<string, Promise<THREE.Group>>();
  return async (asset: FactoryAsset) => {
    let template = cache.get(asset.url);
    if (!template) {
      template = loader.loadAsync(asset.url).then(result => {
        if (!result) throw new Error(`Invalid Collada document: ${asset.url}`);
        const zUp = new THREE.Group();
        zUp.rotation.x = Math.PI / 2;
        zUp.add(result.scene);
        return zUp;
      });
      cache.set(asset.url, template);
    }
    const model = (await template).clone(true);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const normalized = new THREE.Group(); normalized.add(model);
    model.position.set(-center.x, -center.y, -bounds.min.z);
    normalized.scale.set(asset.size[0]! / size.x, asset.size[1]! / size.y, asset.size[2]! / size.z);
    const placement = new THREE.Group(); placement.name = asset.id;
    placement.add(normalized); placement.position.fromArray(asset.position); placement.rotation.z = asset.rotation;
    placement.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
    return placement;
  };
}
