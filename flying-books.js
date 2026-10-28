/**
 * A small flock of books, animated by the room's existing ambient clock.
 *
 * update(timeSeconds, enabled) never schedules work or installs listeners.
 * Pause by leaving timeSeconds unchanged; hide for motion-off with enabled=false.
 * Optional registrars transfer disposal of those resources to the caller.
 */
export function createFlyingBooks({
  THREE,
  parent,
  smallDevice = false,
  reducedMotion = false,
  registerGeometry,
  registerMaterial,
}) {
  const flock = new THREE.Group();
  flock.name = 'Flying library';
  flock.visible = !reducedMotion;
  parent.add(flock);

  const geometries = new Set();
  const materials = new Set();
  let disposed = false;
  let enabled = !reducedMotion;
  let lastTime = 0;
  let updates = 0;

  const geometry = value => {
    geometries.add(value);
    registerGeometry?.(value);
    return value;
  };
  const material = value => {
    materials.add(value);
    registerMaterial?.(value);
    return value;
  };
  const paper = material(new THREE.MeshStandardMaterial({ color: '#eee2c3', roughness: .90 }));
  const pageEdges = material(new THREE.MeshStandardMaterial({ color: '#d9caab', roughness: .94 }));
  const printedInk = material(new THREE.MeshStandardMaterial({ color: '#8c8063', roughness: .96 }));
  const binding = material(new THREE.MeshStandardMaterial({ color: '#bfa372', metalness: .46, roughness: .44 }));
  const covers = ['#65765f', '#ad765e', '#b89a56'].map(color => material(new THREE.MeshStandardMaterial({ color, roughness: .73 })));

  const coverGeometry = geometry(new THREE.BoxGeometry(.438, .622, .027));
  const pageGeometry = geometry(new THREE.BoxGeometry(.407, .568, .031));
  const bindingGeometry = geometry(new THREE.CylinderGeometry(.017, .017, .605, 8));

  // The top leaf arches away from the page block at its centre. It is a page
  // surface, not a flat triangle approximating a bird's wing.
  const topLeafGeometry = geometry(new THREE.PlaneGeometry(.407, .568, 8, 1));
  const topPosition = topLeafGeometry.attributes.position;
  for (let i = 0; i < topPosition.count; i++) {
    const ratio = (topPosition.getX(i) + .2035) / .407;
    topPosition.setZ(i, Math.sin(ratio * Math.PI) * .022);
  }
  topLeafGeometry.computeVertexNormals();

  // Printed lines and tiny exposed page cuts share a single geometry/draw call
  // on each half. Text becomes a quiet editorial texture at room scale.
  const printVertices = [];
  function strip(x1, x2, y, height, z) {
    printVertices.push(x1, y, z, x2, y, z, x2, y + height, z,
      x1, y, z, x2, y + height, z, x1, y + height, z);
  }
  const lineWidths = [.27, .31, .295, .24, .30, .28, .185];
  lineWidths.forEach((width, i) => {
    const y = .146 - i * .045;
    strip(.059, .059 + width, y, .005, .055);
  });
  strip(.059, .245, .212, .011, .055);
  // Three page cuts along the fore-edge catch side-light during each wingbeat.
  for (const z of [.009, .019, .029]) {
    printVertices.push(.421, -.252, z, .421, .252, z, .424, .252, z,
      .421, -.252, z, .424, .252, z, .424, -.252, z);
  }
  const printGeometry = geometry(new THREE.BufferGeometry());
  printGeometry.setAttribute('position', new THREE.Float32BufferAttribute(printVertices, 3));
  printGeometry.computeVertexNormals();

  const ribbonGeometry = geometry(new THREE.BufferGeometry());
  ribbonGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.012, 0, 0, .012, 0, 0, .018, -.144, .016,
    -.012, 0, 0, .018, -.144, .016, 0, -.126, .016,
    -.012, 0, 0, 0, -.126, .016, -.012, -.149, .016,
  ], 3));
  ribbonGeometry.computeVertexNormals();
  const ribbonMaterial = material(new THREE.MeshStandardMaterial({ color: '#b89a56', roughness: .76, side: THREE.DoubleSide }));

  function mesh(shape, surface, holder, x = 0, y = 0, z = 0) {
    const object = new THREE.Mesh(shape, surface);
    object.position.set(x, y, z);
    object.castShadow = false;
    object.receiveShadow = false;
    holder.add(object);
    return object;
  }

  const paths = smallDevice ? [
    { cx: 1.25, rx: 2.15, y: 6.08, z: 2.95, rz: .52, phase: .22, scale: .82, rate: .115 },
    { cx: 3.75, rx: 1.55, y: 6.62, z: 1.85, rz: .40, phase: 3.05, scale: .67, rate: .104 },
  ] : [
    { cx: -3.90, rx: 2.65, y: 6.15, z: 2.9, rz: .68, phase: .32, scale: .91, rate: .116 },
    { cx: -.15, rx: 2.85, y: 6.63, z: 1.85, rz: .56, phase: 2.70, scale: .71, rate: .103 },
    { cx: 3.75, rx: 1.85, y: 5.99, z: 3.10, rz: .64, phase: 4.55, scale: .78, rate: .109 },
  ];
  const books = paths.map((path, index) => {
    const book = new THREE.Group();
    book.name = ['Sage atlas', 'Terracotta stories', 'Brass notebook'][index];
    book.scale.setScalar(path.scale);
    flock.add(book);

    const wings = [-1, 1].map(side => {
      const hinge = new THREE.Group();
      hinge.position.x = side * .014;
      book.add(hinge);
      mesh(coverGeometry, covers[index], hinge, side * .220, 0, -.021);
      mesh(pageGeometry, pageEdges, hinge, side * .216, .006, .009);

      const leaf = mesh(topLeafGeometry, paper, hinge, side * .216, .006, .029);
      // Mirroring also mirrors the shallow paper curl naturally.
      leaf.scale.x = side;
      const print = mesh(printGeometry, printedInk, hinge);
      print.scale.x = side;
      return { hinge, leaf, side };
    });
    mesh(bindingGeometry, binding, book, 0, 0, -.008);
    const ribbon = mesh(ribbonGeometry, ribbonMaterial, book, .004, -.285, .009);
    return { book, wings, ribbon, path };
  });

  function update(timeSeconds = lastTime, motion = true) {
    if (disposed) return;
    enabled = Boolean(motion) && !reducedMotion;
    flock.visible = enabled;
    if (!enabled) return;
    const time = Number.isFinite(timeSeconds) ? timeSeconds : lastTime;
    lastTime = time;
    updates++;
    for (let i = 0; i < books.length; i++) {
      const { book, wings, ribbon, path } = books[i];
      const orbit = time * path.rate + path.phase;
      const stroke = time * (1.94 + i * .11) + path.phase * 1.8;
      const bank = Math.cos(orbit) * -.17 + Math.sin(orbit * 2 + path.phase) * .065;
      book.position.set(
        path.cx + Math.sin(orbit) * path.rx,
        path.y + Math.sin(orbit * 2 + path.phase) * .22 + Math.cos(orbit + path.phase) * .065,
        path.z + Math.cos(orbit) * path.rz,
      );
      // Face the open pages toward the visitor, with a little lift and heading.
      // A full lookAt tangent would turn them edge-on for half their flight.
      book.rotation.set(-.37 + Math.sin(orbit + .6) * .105, Math.sin(orbit + .8) * .33, bank);
      for (const { hinge, leaf, side } of wings) {
        const wingbeat = Math.sin(stroke - side * .075);
        hinge.rotation.y = -side * (.27 + wingbeat * .34);
        // A delayed top leaf gives the wingbeat a papery follow-through.
        leaf.rotation.y = -side * Math.sin(stroke - .31) * .025;
      }
      ribbon.rotation.x = Math.sin(stroke - .7) * .19;
      ribbon.rotation.z = Math.sin(orbit * 3 + .5) * .13;
    }
  }

  update(0, !reducedMotion);
  return {
    group: flock,
    update,
    setMotion(value) { update(lastTime, value); },
    getDiagnostics() {
      return {
        count: books.length,
        visibleCount: flock.visible && !disposed ? books.length : 0,
        enabled,
        reducedMotion,
        updates,
        geometries: geometries.size,
        materials: materials.size,
        drawCalls: books.length * 10,
        time: Number(lastTime.toFixed(3)),
        disposed,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      enabled = false;
      flock.visible = false;
      flock.removeFromParent();
      if (!registerGeometry) geometries.forEach(value => value.dispose());
      if (!registerMaterial) materials.forEach(value => value.dispose());
    },
  };
}
