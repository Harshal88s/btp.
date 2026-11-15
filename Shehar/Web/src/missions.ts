// Missions (port of Missions/*.cs). Scripted with async/await; every destination is a real OSM landmark,
// POI or road node looked up at runtime. Characters are fictional; fares are game values, not official tariffs.
import { GPS } from './gps';
import { RoadGraph } from './graph';
import { Poi } from './types';
import { Vehicle } from './vehicles';
import { World } from './world';

export interface GameApi {
  world: World; graph: RoadGraph; gps: GPS;
  pos(): [number, number]; speed(): number; vehicle(): Vehicle | null;
  toast(t: string, c?: string): void; big(t: string, sub: string, c: string): void; say(who: string, line: string, sec: number): void;
  earn(n: number, why: string): void; setHour(h: number): void; chime(ok: boolean): void;
  marker(x: number, z: number, color: number): () => void;
  person(x: number, z: number): () => void;
}

export interface Mission { id: string; title: string; category: string; brief: string; startLabel: string; x: number; z: number; reward: number; need?: string; run: (r: MissionRunner) => Promise<number> }

class Abort extends Error {}
const isCommercial = (v: Vehicle | null) => !!v && (v.spec.id === 'auto' || v.spec.id === 'taxi');

export class MissionRunner {
  all: Mission[] = [];
  active: Mission | null = null;
  objective = ''; timeLeft = 0; timerOn = false;
  private waits: { fn: () => boolean; res: () => void; rej: (e: Error) => void }[] = [];
  private cleanup: (() => void)[] = [];
  private needVehicle = false; private outOfVeh = 0; private failReason = '';

  constructor(public g: GameApi) { this.register(); }

  canStart(m: Mission): string | null {
    if (this.active) return 'Another mission is in progress';
    if (m.need === 'commercial' && !isCommercial(this.g.vehicle())) return 'Needs an auto-rickshaw or taxi - take one from traffic (E)';
    return null;
  }

  async start(m: Mission) {
    const why = this.canStart(m); if (why) { this.g.toast(why, '#ff9a80'); return; }
    this.active = m; this.aborting = false; this.failReason = ''; this.objective = ''; this.timerOn = false; this.needVehicle = false; this.outOfVeh = 0;
    this.g.big(m.title.toUpperCase(), m.category, '#ffcc33');
    try {
      const reward = await m.run(this);
      this.finish();
      this.g.earn(reward, 'Mission passed');
      this.g.big('MISSION PASSED', '+₹' + reward.toLocaleString('en-IN'), '#5cf07a');
      this.g.chime(true);
      try { const d = JSON.parse(localStorage.getItem('shehar_done') || '[]'); if (!d.includes(m.id)) { d.push(m.id); localStorage.setItem('shehar_done', JSON.stringify(d)); } } catch { /* storage unavailable */ }
    } catch (e) {
      this.finish();
      this.g.big('MISSION FAILED', this.failReason || 'Mission abandoned', '#ff5a4d');
      this.g.chime(false);
    }
  }

  fail(reason: string) { this.failReason = reason; this.aborting = true; const w = this.waits; this.waits = []; for (const x of w) x.rej(new Abort(reason)); }
  failNow(reason: string): never { this.failReason = reason; this.aborting = true; throw new Abort(reason); }
  private aborting = false;
  abort() { if (this.active) this.fail('Mission abandoned'); }

  private finish() {
    this.active = null; this.objective = ''; this.timerOn = false; this.needVehicle = false;
    this.g.gps.clear(); for (const c of this.cleanup) c(); this.cleanup = [];
  }

  update(dt: number) {
    if (!this.active) return;
    if (this.timerOn) { this.timeLeft -= dt; if (this.timeLeft <= 0) { this.fail('Out of time'); return; } }
    if (this.needVehicle) {
      const v = this.g.vehicle();
      if (!v) { this.outOfVeh += dt; if (this.outOfVeh > 45) { this.fail('You abandoned the job'); return; } } else this.outOfVeh = 0;
      if (v && v.health <= 0) { this.fail('Your vehicle was wrecked'); return; }
    }
    const w = this.waits; this.waits = [];
    for (const x of w) { if (x.fn()) x.res(); else this.waits.push(x); }
  }

  until(fn: () => boolean) { return new Promise<void>((res, rej) => { if (this.aborting) rej(new Abort(this.failReason)); else this.waits.push({ fn, res, rej }); }); }
  sleep(sec: number) { let t = 0; let last = performance.now(); return this.until(() => { const n = performance.now(); t += (n - last) / 1000; last = n; return t >= sec; }); }
  async say(who: string, line: string, sec = 4) { this.g.say(who, line, sec); await this.sleep(sec); }

  async goTo(x: number, z: number, objective: string, label: string, o: { radius?: number; vehicle?: boolean; stop?: boolean; time?: number; ok?: (v: Vehicle | null) => boolean; hint?: string } = {}) {
    const radius = o.radius ?? 16, vehicle = o.vehicle ?? true;
    this.needVehicle = vehicle;
    const [px, pz] = this.g.pos();
    this.g.gps.set(x, z, label, px, pz, !!this.g.vehicle());
    const rm = this.g.marker(x, z, 0xffd930);
    if (o.time) { this.timeLeft = o.time; this.timerOn = true; }
    try {
      await this.until(() => {
        const v = this.g.vehicle(), okV = !vehicle || (!!v && (!o.ok || o.ok(v)));
        this.objective = okV ? objective : (o.hint || 'Get back in a vehicle') + ' – ' + objective;
        const [qx, qz] = this.g.pos();
        if (Math.hypot(qx - x, qz - z) < radius && okV) { if (!o.stop || this.g.speed() < 2.5) return true; this.objective = 'Stop the vehicle'; }
        return false;
      });
    } finally { rm(); }
    this.timerOn = false; this.g.gps.clear();
  }

  async checkpoints(pts: [number, number][], name: string, radius: number, time: number) {
    this.needVehicle = true; this.timeLeft = time; this.timerOn = true;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i], [px, pz] = this.g.pos();
      this.g.gps.set(x, z, name + ' checkpoint ' + (i + 1), px, pz, true);
      const rm = this.g.marker(x, z, 0x33ccff);
      try {
        await this.until(() => {
          this.objective = name + ': checkpoint ' + (i + 1) + ' / ' + pts.length + (this.g.vehicle() ? '' : ' (get in a vehicle!)');
          const [qx, qz] = this.g.pos();
          return Math.hypot(qx - x, qz - z) < radius && !!this.g.vehicle();
        });
      } finally { rm(); }
      this.g.chime(true);
    }
    this.timerOn = false; this.g.gps.clear();
  }

  routeSeconds(ax: number, az: number, bx: number, bz: number, avg: number): [number, number] {
    const g = this.g.graph, p = g.findPath(g.nearestNode(ax, az, 500), g.nearestNode(bx, bz, 500), true);
    const m = p ? g.pathLength(p) : Math.hypot(bx - ax, bz - az) * 1.4;
    return [m / avg, m];
  }
  kerb(x: number, z: number): [number, number] { const [rx, rz] = this.g.world.roadPointNear(x, z); return [rx, rz]; }
  track(f: () => void) { this.cleanup.push(f); }

  // ------------------------------------------------------------------ content
  private register() {
    const w = this.g.world, L = (n: string) => w.landmark(n);
    const station = L('Pune Railway Station'), dagdu = L('Dagdusheth Halwai Ganpati'), fc = L('Fergusson College');
    if (station && dagdu && fc) {
      const [sx, sz] = this.kerb(station.x, station.z);
      this.all.push({ id: 'story_1', title: 'Welcome to Pune', category: 'Story – Chapter 1', reward: 3000, x: sx, z: sz, startLabel: 'Pune Railway Station',
        brief: 'Pick up cousin Aarav at Pune Railway Station, take him to Dagdusheth Halwai Ganpati, then drop him at Fergusson College.',
        run: r => this.welcome(r, station, dagdu, fc) });
    }
    const trail = ['Shaniwar Wada', 'Lal Mahal', 'Kasba Ganpati', 'Nana Wada', 'Vishrambag Wada'].map(L).filter((p): p is Poi => !!p);
    if (trail.length >= 3) {
      const [tx, tz] = this.kerb(trail[0].x, trail[0].z);
      this.all.push({ id: 'story_2', title: 'Peshwa Heritage Trail', category: 'Story – Chapter 2 / Exploration', reward: 2500, x: tx, z: tz, startLabel: trail[0].name,
        brief: 'Explore the old city: ' + trail.map(p => p.name).join(', ') + '. Walk or drive.', run: r => this.heritage(r, trail) });
    }
    const nodesOf = (name: string) => { const out: [number, number][] = []; for (const rd of w.idx.roads) if (rd.name === name && rd.drivable) for (const n of rd.nodes) out.push([w.idx.nodeX[n], w.idx.nodeZ[n]]); return out; };
    const fcR = nodesOf('Gopal Krushna Gokhale Path'), jm = nodesOf('Jangli Maharaj Path');
    if (fcR.length && jm.length) {
      const byZ = (a: [number, number][]) => a.slice().sort((p, q) => p[1] - q[1]);
      const f = byZ(fcR), j = byZ(jm);
      const wps: [number, number][] = [f[0], f[f.length - 1], j[j.length - 1], j[0]];
      this.all.push({ id: 'story_3', title: 'FC Road – JM Road Night Sprint', category: 'Story – Chapter 3 / Race', reward: 4000, x: wps[0][0], z: wps[0][1], startLabel: 'FC Road (Deccan end)',
        brief: 'Time trial on the real one-way pair: north up FC Road, through Shivajinagar, back south down JM Road.', run: r => this.race(r, wps) });
    }
    const swargate = L('Swargate Bus Stand') || L('Deccan Gymkhana');
    if (swargate) {
      const [x, z] = this.kerb(swargate.x, swargate.z);
      this.all.push({ id: 'rickshaw', title: 'Rickshaw Fares', category: 'Driving – Auto / Taxi', reward: 0, need: 'commercial', x, z, startLabel: swargate.name,
        brief: 'In an auto-rickshaw or taxi, complete 3 metered fares between real Pune destinations.', run: r => this.fares(r) });
    }
    const food = w.idx.pois.find(p => p.kind === 'food' && p.name === 'Vaishali') || w.idx.pois.find(p => p.kind === 'food' && !!p.name);
    if (food) {
      const [x, z] = this.kerb(food.x, food.z);
      this.all.push({ id: 'delivery', title: 'Hot Food Express', category: 'Driving – Delivery', reward: 0, x, z, startLabel: food.name,
        brief: 'Collect an order at ' + food.name + ' and deliver it before it gets cold.', run: r => this.delivery(r, food) });
    }
  }

  private async welcome(r: MissionRunner, st: Poi, dg: Poi, fc: Poi) {
    await r.say('Aai (phone)', "Your cousin Aarav's train from Mumbai has reached Pune station. Go and pick him up!", 4.5);
    const [ax, az] = r.kerb(st.x, st.z);
    await r.goTo(ax, az, 'Pick up Aarav at Pune Railway Station', 'Pune Railway Station', { radius: 18, stop: true });
    const [px, pz] = this.g.pos(); const rm = this.g.person(px + 3, pz); r.track(rm);
    await r.say('Aarav', 'Arre bhau! First things first – take me to Dagdusheth Ganpati for darshan.', 4); rm();
    const [bx, bz] = r.kerb(dg.x, dg.z); let [t] = r.routeSeconds(px, pz, bx, bz, 7.5);
    await r.goTo(bx, bz, 'Drive Aarav to Dagdusheth Halwai Ganpati', dg.name, { radius: 22, stop: true, time: t + 60 });
    await r.say('Aarav', 'Ganpati Bappa Morya! The temple was founded by the sweet-maker Dagdusheth Halwai in the 1890s.', 4.5);
    await r.say('Aarav', 'Now drop me at Fergusson College – my hostel is there.', 3.5);
    const [cx, cz] = r.kerb(fc.x, fc.z); [t] = r.routeSeconds(bx, bz, cx, cz, 7.5);
    await r.goTo(cx, cz, 'Drop Aarav at Fergusson College', fc.name, { radius: 25, stop: true, time: t + 70 });
    await r.say('Aarav', 'Thanks! Come back later – FC Road has the best food in Pune.', 3);
    return 3000;
  }

  private facts: Record<string, string> = {
    'Shaniwar Wada': 'Seat of the Peshwas, completed in 1732. A fire in 1828 destroyed the palace; the fortified walls and gates survive.',
    'Lal Mahal': 'A reconstruction of the palace where the young Shivaji Maharaj lived with his mother Jijabai.',
    'Kasba Ganpati': "Pune's presiding deity (gramadaivat) and the first of the 'manache' Ganpatis in the Ganeshotsav procession.",
    'Nana Wada': "Built for Nana Phadnavis, the Peshwas' famous minister, in the late 18th century.",
    'Vishrambag Wada': 'Residence of the last Peshwa, Bajirao II, from the early 1800s – known for its carved wooden facade.',
  };

  private async heritage(r: MissionRunner, stops: Poi[]) {
    await r.say('Guide', 'The peths hold three centuries of history. Visit each stop – walking is fine, the lanes are narrow!', 4.5);
    for (const p of stops) {
      await r.goTo(p.x, p.z, 'Visit ' + p.name, p.name, { radius: 30, vehicle: false });
      if (this.facts[p.name]) await r.say(p.name, this.facts[p.name], 5);
    }
    return 2500;
  }

  private async race(r: MissionRunner, wps: [number, number][]) {
    const g = this.g.graph, pts: [number, number][] = [];
    for (let i = 0; i + 1 < wps.length; i++) {
      const p = g.findPath(g.nearestNode(wps[i][0], wps[i][1]), g.nearestNode(wps[i + 1][0], wps[i + 1][1]), true);
      if (p) for (const n of p) pts.push([g.X[n], g.Z[n]]);
    }
    const cps: [number, number][] = []; let acc = 0, total = 0;
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); acc += d; total += d; if (acc >= 230) { cps.push(pts[i]); acc = 0; } }
    if (pts.length) cps.push(pts[pts.length - 1]);
    await r.goTo(wps[0][0], wps[0][1], 'Go to the start line on FC Road', 'FC Road start', { radius: 18, stop: true });
    this.g.setHour(22.5);
    await r.say('Race marshal', 'FC Road northbound, through Shivajinagar, then JM Road south. Both are one-way – stay with the flow!', 4);
    for (const c of ['3', '2', '1']) { this.g.big(c, '', '#ffffff'); await r.sleep(1); }
    this.g.big('GO!', '', '#66ff66');
    const par = total / 13.5 + 20, t0 = performance.now();
    await r.checkpoints(cps, 'FC-JM Sprint', 16, par);
    const time = (performance.now() - t0) / 1000;
    this.g.toast('Lap ' + time.toFixed(1) + ' s (par ' + par.toFixed(0) + ' s)', '#9fdcff');
    return Math.round(4000 + Math.max(0, par - time) * 40);
  }

  private randomPoi(x: number, z: number, min: number, max: number): Poi | null {
    const kinds = ['food', 'college', 'rail_station', 'bus_station', 'hospital', 'mall', 'cinema', 'attraction', 'hotel'];
    const c = this.g.world.idx.pois.filter(p => kinds.includes(p.kind) && p.name && Math.hypot(p.x - x, p.z - z) >= min && Math.hypot(p.x - x, p.z - z) <= max);
    return c.length ? c[Math.floor(Math.random() * c.length)] : null;
  }

  private async fares(r: MissionRunner) {
    let earned = 0;
    for (let i = 0; i < 3; i++) {
      const [px, pz] = this.g.pos();
      const pick = this.randomPoi(px, pz, 250, 900) || this.randomPoi(px, pz, 100, 2000);
      if (!pick) r.failNow('No passengers around here');
      const [ax, az] = r.kerb(pick!.x, pick!.z);
      await r.goTo(ax, az, 'Fare ' + (i + 1) + '/3: pick up the passenger at ' + pick!.name, pick!.name, { stop: true, ok: isCommercial, hint: 'Get back in your auto / taxi' });
      const drop = this.randomPoi(ax, az, 900, 2600) || this.randomPoi(ax, az, 400, 4000);
      if (!drop) r.failNow('The passenger changed their mind');
      await r.say('Passenger', ['Bhau, ' + drop!.name + ' – and take the shortcut!', drop!.name + ' jaana hai. Meter chalu karo.', 'Can you drop me at ' + drop!.name + '?'][Math.floor(Math.random() * 3)], 3);
      const [bx, bz] = r.kerb(drop!.x, drop!.z), [t, m] = r.routeSeconds(ax, az, bx, bz, 7.5), t0 = performance.now();
      await r.goTo(bx, bz, 'Drive the passenger to ' + drop!.name, drop!.name, { stop: true, time: t + 45, ok: isCommercial, hint: 'Get back in your auto / taxi' });
      const fare = Math.round(26 + Math.max(0, m / 1000 - 1.5) * 17), tip = (performance.now() - t0) / 1000 < t * 0.6 ? 20 : 0;
      earned += fare + tip; this.g.earn(fare + tip, 'Fare ' + (m / 1000).toFixed(1) + ' km' + (tip ? ' + tip' : ''));
    }
    return 150;
  }

  private async delivery(r: MissionRunner, shop: Poi) {
    const [sx, sz] = r.kerb(shop.x, shop.z);
    await r.goTo(sx, sz, 'Collect the order at ' + shop.name, shop.name, { stop: true });
    await r.say(shop.name, "Order packed – deliver it while it's hot!", 3);
    const g = this.g.graph, w = this.g.world; let dx = sx, dz = sz;
    for (let k = 0; k < 60; k++) {
      const a = Math.random() * Math.PI * 2, d = 800 + Math.random() * 1200, x = sx + Math.cos(a) * d, z = sz + Math.sin(a) * d;
      if (!w.inBounds(x, z, -100)) continue;
      const n = g.nearestNode(x, z, 150, true, nd => { for (let j = 0; j < g.degree(nd); j++) if (g.roadOfEdge(g.neighbor(nd, j).edge).rank === 3) return true; return false; });
      if (n >= 0) { dx = g.X[n]; dz = g.Z[n]; break; }
    }
    const street = w.streetName(dx, dz), label = (street ? street + ', ' : '') + w.zoneName(dx, dz);
    const h0 = this.g.vehicle()?.health ?? 100, [t, m] = r.routeSeconds(sx, sz, dx, dz, 8);
    await r.goTo(dx, dz, 'Deliver to the customer on ' + label, label, { radius: 18, stop: true, time: t + 40 });
    const dmg = Math.max(0, h0 - (this.g.vehicle()?.health ?? h0));
    return Math.round(Math.max(80, 250 + m / 1000 * 40 - dmg * 4));
  }
}
