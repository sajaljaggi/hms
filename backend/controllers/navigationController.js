const db = require('../config/db');
const { escapeLike } = require('../utils/sql');
const { NotFoundError } = require('../utils/errors');
const { buildGraph, shortestPath } = require('../utils/pathfinding');

const WALK_M_PER_MIN = 70;

// GET /api/navigation/locations?category=&q=
const listLocations = async (req, res, next) => {
  try {
    const { category, q } = req.query;
    const where = [];
    const params = [];
    if (category) { where.push('category = ?'); params.push(category); }
    if (q) { where.push('name LIKE ?'); params.push(`%${escapeLike(q)}%`); }
    const [rows] = await db.query(
      `SELECT * FROM nav_locations ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY floor, name`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// GET /api/navigation/route?from=&to=&accessible=
const getRoute = async (req, res, next) => {
  try {
    const { from, to, accessible } = req.query;
    const [locations] = await db.query('SELECT id, code, name, floor FROM nav_locations');
    const byId = new Map(locations.map((l) => [l.id, l]));
    if (!byId.has(from) || !byId.has(to)) throw new NotFoundError('Location not found.');
    const [edges] = await db.query('SELECT from_location_id, to_location_id, distance_m, instruction, reverse_instruction, `accessible` FROM nav_edges');
    const path = shortestPath(buildGraph(edges, { accessibleOnly: accessible }), from, to);
    if (!path) throw new NotFoundError('No route found between these locations.');
    const pick = (id) => ({ id, code: byId.get(id).code, name: byId.get(id).name, floor: byId.get(id).floor });
    res.json({ success: true, data: {
      from: pick(from),
      to: pick(to),
      accessible,
      totalDistance: path.totalDistance,
      estimatedMinutes: path.totalDistance > 0 ? Math.max(1, Math.ceil(path.totalDistance / WALK_M_PER_MIN)) : 0,
      steps: path.steps.map((s) => ({ from: pick(s.fromId), to: pick(s.toId), instruction: s.instruction, distance: s.distance })),
    } });
  } catch (err) { next(err); }
};

// POST /api/navigation/locations
const createLocation = async (req, res, next) => {
  try {
    const { code, name, category, building = 'Main', floor, description = null } = req.body;
    const [r] = await db.query(
      'INSERT INTO nav_locations (code, name, category, building, floor, description) VALUES (?, ?, ?, ?, ?, ?)',
      [code, name, category, building, floor, description]
    );
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (err) { next(err); }
};

// POST /api/navigation/edges (a missing location surfaces as 400 via the FK error mapping)
const createEdge = async (req, res, next) => {
  try {
    const { fromLocationId, toLocationId, distanceM, instruction, reverseInstruction, accessible } = req.body;
    const [r] = await db.query(
      `INSERT INTO nav_edges (from_location_id, to_location_id, distance_m, instruction, reverse_instruction, \`accessible\`)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [fromLocationId, toLocationId, distanceM, instruction, reverseInstruction, accessible ? 1 : 0]
    );
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (err) { next(err); }
};

const deleteById = (table, label) => async (req, res, next) => {
  try {
    const [r] = await db.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
    if (r.affectedRows === 0) throw new NotFoundError(`${label} not found.`);
    res.json({ success: true, data: { id: Number(req.params.id) } });
  } catch (err) { next(err); }
};

module.exports = {
  listLocations, getRoute, createLocation, createEdge,
  deleteEdge: deleteById('nav_edges', 'Edge'),
  deleteLocation: deleteById('nav_locations', 'Location'),
};
