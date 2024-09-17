const g_canvas = document.getElementById('graph_canvas');
const g_ctx = g_canvas.getContext('2d');
const c_canvas = document.getElementById('circle_packing_canvas');
const c_ctx = c_canvas.getContext('2d');



const max_width = g_canvas.width;
const max_height = g_canvas.height;
const nodes = [];
const connections = [];
const vertices = [];
const edges = [];
const radius = 5;
const default_conn_length = 1.0;
const hull = [];
const active_paths = [];
const creases = [];

const circles = [];

const node_x_input = document.getElementById('node_x');
const node_y_input = document.getElementById('node_y');
const edge_lengths_list = document.getElementById('edge_lengths');

let selected_node = null;
let is_dragging = false;
let drag_offset_x = 0;
let drag_offset_y = 0;
let node_id = 0;
let connection_id = 0;
let scale_factor = 1;
let visual_scale_factor = 20;

let square_side_length = c_canvas.width;
let square_x = (c_canvas.width - square_side_length) / 2;
let square_y = (c_canvas.height - square_side_length) / 2;
let is_square_minimum_size = false;

let view_creases = false;


g_canvas.addEventListener('mousedown', handle_mouse_down);
g_canvas.addEventListener('mouseup', handle_mouse_up);
g_canvas.addEventListener('mousemove', handle_mouse_move);
g_canvas.addEventListener('contextmenu', event => event.preventDefault());


function menu_update_node() {
    if (selected_node) {
        selected_node.x = parseFloat(node_x_input.value);
        selected_node.y = parseFloat(node_y_input.value);
        draw_graph();
    }
}

function menu_update_edge(conn_id, conn_length) {
    const conn = connections.filter((connection) => (connection.connection_id === conn_id))[0]
    conn.connection_length = parseFloat(conn_length);
    update_radii();
    draw_graph();
}

function menu_update_menu() {
    if (selected_node) {
        node_x_input.value = selected_node.x;
        node_y_input.value = selected_node.y;
    }

    edge_lengths_list.innerHTML = '';
    connections.forEach((conn) => {
        const list_item = document.createElement(("li"));
        list_item.innerHTML = `Edge ID ${conn.connection_id}: <input type="number" value="${conn.connection_length}" onchange="menu_update_edge(${conn.connection_id}, this.value)">`;
        edge_lengths_list.appendChild(list_item);
    });
}

function menu_show_creases_only() {
    view_creases = true;
    draw_graph();
    view_creases = false;
}


function handle_mouse_down(event) {
    const rect = g_canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const clicked_node = find_clicked_node(x, y);

    if (event.button === 0) {
        // left click
        if (clicked_node) {
            // select clicked node
            selected_node = clicked_node;
            drag_offset_x = x - selected_node.x;
            drag_offset_y = y - selected_node.y;
            is_dragging = true;
        }

        else {
            // add a new node

            const new_node = {node_id, x, y, adjacent_nodes: [], vertex_radius: 0, scaled:false};
            node_id ++;


            //connect new node to the selected node
            if (selected_node) {
                selected_node.adjacent_nodes.push(new_node);
                new_node.adjacent_nodes.push(selected_node);
                let new_connection = {connection_id, start_node:selected_node,
                    end_node:new_node, connection_length: default_conn_length};
                connections.push(new_connection);
                connection_id++;
            }
            else {
                selected_node = new_node;
            }

            nodes.push(new_node)

        }
    } else if (event.button === 2) {
        // right click
        if (clicked_node) {
            // Remove the clicked node
            const del_node = clicked_node;
            if (clicked_node === selected_node) {
                selected_node = null;
            }

            nodes.forEach((node) => {
                const del_index = node.adjacent_nodes.indexOf(del_node);
                if (del_index !== -1) {
                    node.adjacent_nodes.splice(del_index, 1);
                }
            });

            let del_connections_id = []

            connections.forEach((connection) => {
                if ((connection.start_node === del_node) || (connection.end_node === del_node)) {
                    del_connections_id.push(connection.connection_id);
                }
            });

            // scuffed, sacriligious piece of crap
            let temp_connections = connections.filter((connection) => !(del_connections_id.includes(connection.connection_id)));
            replace_array(temp_connections, connections);
            nodes.splice(nodes.indexOf(clicked_node), 1);
        }
    }

    update_vertices();
    update_convex_hull();
    update_radii();

    draw_graph();
    console.log("yay", selected_node, nodes, connections)
}

function replace_array(temp_array, target_array) {
    for (let i = 0;i < temp_array.length ;i++) {
        target_array[i] = temp_array[i];
    }
    let extra_items = target_array.length - temp_array.length;
    target_array.splice(target_array.length-extra_items, extra_items);
}

function get_node_from_id(node_id) {
    return nodes.find(node => node.node_id === node_id);
}

function handle_mouse_up() {
    is_dragging = false;
    update_convex_hull();
    menu_update_menu();
    draw_graph();
}

function handle_mouse_move(event) {
    if (is_dragging && selected_node) {
        const rect = g_canvas.getBoundingClientRect();
        selected_node.x = event.clientX - rect.left - drag_offset_x;
        selected_node.y = event.clientY - rect.top - drag_offset_y;

        // sexy blocked out code but v inefficient
        update_convex_hull();
        draw_graph();

    }
}

function find_clicked_node(x, y) {
    return nodes.find((node) => {
        const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
        return distance < radius; // Assuming a node has a radius of 10
    });
}

function draw_graph() {
    g_ctx.clearRect(0, 0, g_canvas.width, g_canvas.height);

    // Draw edges
    if (!view_creases) {
        connections.forEach((conn) => {
            draw_connection(conn.start_node, conn.end_node, "black")
            g_ctx.font = "10px Arial";
            g_ctx.fillStyle = "black";
            g_ctx.fillText(conn.connection_id + ": " + String(conn.connection_length), 0.5 * (conn.start_node.x + conn.end_node.x) + 5,
                0.5 * (conn.start_node.y + conn.end_node.y) + 5);
        })


        // Draw active_paths
        active_paths.forEach((conn) => {
            draw_connection(conn[0], conn[1], "green")
        })
    }

    // Draw creases
    creases.forEach((conn) => {
        console.log(conn);
        draw_connection(conn[0], conn[1], "red")
    })

    if (!view_creases) {

        // Draw convex hull
        hull.forEach((points) => {
            draw_connection(points[0], points[1], "orange");
        });

        // Draw nodes
        nodes.forEach((node) => {
            g_ctx.beginPath();
            g_ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
            g_ctx.fillStyle = selected_node === node ? 'red' : 'blue';
            g_ctx.fill();
            g_ctx.stroke();
            g_ctx.fillStyle = 'white'
            g_ctx.font = "10px Arial";
            g_ctx.fillText(String(node.node_id), node.x - radius / 2, node.y + radius / 2);
        });

        // Draw vertex circles
        vertices.forEach((vertex) => {

            //console.log("drawnVertices", vertices);
            //vertex.vertex_radius = 20;

            let drawn_radius = (vertex.scaled) ?
                (vertex.vertex_radius * visual_scale_factor / scale_factor) : vertex.vertex_radius * visual_scale_factor
            g_ctx.beginPath();
            g_ctx.arc(vertex.x, vertex.y, drawn_radius, 0, 2 * Math.PI);
            g_ctx.strokeStyle = "black"
            g_ctx.stroke();
        });
    }
}

function draw_connection(node1, node2, colour) {
    g_ctx.beginPath();
    g_ctx.moveTo(node1.x, node1.y);
    g_ctx.lineTo(node2.x, node2.y);
    g_ctx.strokeStyle = colour
    g_ctx.stroke();
}

function update_graph() {
    draw_graph();
}

function update_vertices() {
    nodes.forEach((node) => {
        if (node.adjacent_nodes.length < 2) {
            if (!vertices.includes(node)) {
                vertices.push(node);
            }
        }
        else if (vertices.includes(node)){
            vertices.splice(vertices.indexOf(node), 1);
        }
    })


    let temp_vertices = [];
    vertices.forEach((vertex) => {
        if (nodes.includes(vertex)) {
            temp_vertices.push(vertex);
        }
    });
    replace_array(temp_vertices, vertices);

    console.log("actualVertices", vertices);
    //del_connections_id.includes(connection.connection_id

}

function update_radii() {
    vertices.forEach((vertex) => {
        if (!vertex.scaled) {
            vertex.vertex_radius = get_path_length(vertex, vertex.adjacent_nodes[0])
        }
    })
}

function get_path(start_node, end_node) {
    const visited = new Set();
    const stack = [{ node: start_node, path: [] }];
    while (stack.length) {
        const { node, path } = stack.pop();
        if (node === end_node) {
            return path.concat(node);
        }
        if (!visited.has(node)) {
            visited.add(node);
            node.adjacent_nodes.forEach((adj_node) => {
                stack.push({ node: adj_node, path: path.concat(node) });
            });
        }
    }
    // no path found, shouldn't happen for proper spanning tree
    return null;
}


function get_path_length(start_node, end_node) {
    const node_path = get_path(start_node, end_node);
    console.log(node_path)
    let conn_path = [];
    let length = 0;

    if (node_path) {
        for (let i = 0; i < node_path.length; i++) {
            if (!(i === node_path.length - 1)) {
                let check_nodes = [node_path[i], node_path[i + 1]];
                let temp_conn = connections.filter((conn) => ((check_nodes.includes(conn.start_node)) && (check_nodes.includes(conn.end_node))));
                if (temp_conn) {
                    conn_path.push(temp_conn[0])
                }
            }
        }
    }

    conn_path.forEach((conn) => {
        console.log("l: ", conn.connection_length)
        length += conn.connection_length;
    })
    console.log("conn length: ", length)
    return length;
}

function get_actual_length(start_node, end_node) {
    return Math.sqrt((start_node.x - end_node.x)**2 + (start_node.y - end_node.y)**2);
}

function update_convex_hull() {
    //reset hull
    hull.length = 0;
    function get_hull(start_point, end_point, side_points){
        if (side_points.length === 0) {
            hull.push([start_point, end_point]);
            return;
        }


        const furthest_point = get_furthest_point(start_point, end_point, side_points);

        //get rid of points inside the triangle
        let temp_side_points = [];
        side_points.forEach((point) => {
            if (point !== furthest_point) {
                if (!(point_in_triangle(point, start_point, end_point, furthest_point))) {
                    temp_side_points.push(point);
                }
            }
        })
        replace_array(temp_side_points, side_points);

        const side_one = [];
        const side_two = [];

        side_points.forEach((point) => {
            if (point !== furthest_point) {
                const side = side_of_line(start_point, furthest_point, point);
                if (side === 1) {
                    side_one.push(point);
                } else if (side === -1) {
                    side_two.push(point);
                }
            }
        })

        get_hull(start_point, furthest_point, side_one, hull);
        get_hull(furthest_point, end_point, side_two, hull);
    }

    // more fuckin triangles man
    function point_in_triangle(p, p0, p1, p2) {
        const A = 0.5 * (-p1.y * p2.x + p0.y * (-p1.x + p2.x) + p0.x * (p1.y - p2.y) + p1.x * p2.y);
        const sign = A < 0 ? -1 : 1;
        const s = (p0.y * p2.x - p0.x * p2.y + (p2.y - p0.y) * p.x + (p0.x - p2.x) * p.y) * sign;
        const t = (p0.x * p1.y - p0.y * p1.x + (p0.y - p1.y) * p.x + (p1.x - p0.x) * p.y) * sign;

        return s > 0 && t > 0 && (s + t) < 2 * A * sign;
    }


    function get_furthest_point(p1, p2, points) {
        let furthest_point = null;
        let max_dist = -1;
        points.forEach((point) => {
            const dist = dist_to_line(p1, p2, point);
            if (dist > max_dist) {
                max_dist = dist;
                furthest_point = point;
            }
        })
        return furthest_point;
    }
    function side_of_line(p1, p2, p) {
        // det of 2x2 matrix
        const val = (p.y - p1.y) * (p2.x - p1.x) - (p2.y - p1.y) * (p.x - p1.x);
        if (val === 0) {
            return 0; // on the line
        } else {
            return (val > 0) ? 1 : -1; // Left or right side of the line
        }
    }

    function dist_to_line(p1, p2, p) {
        return Math.abs((p2.x - p1.x) * (p1.y - p.y) - (p1.x - p.x) * (p2.y - p1.y)) /
            Math.sqrt(((p2.y - p1.y)**2) + ((p2.x - p1.x)**2));
    }

    //find min x and max x
    let min_vertex = vertices[0];
    let max_vertex = vertices[0];
    for (let i = 1; i < vertices.length; i++) {
        if (vertices[i].x < min_vertex.x) {
            min_vertex = vertices[i];
        }
        if (vertices[i].x > max_vertex.x) {
            max_vertex = vertices[i];
        }
    }

    //div points to diff sides of line
    let side_one = [];
    let side_two = [];

    vertices.forEach((vertex) => {
        let side = side_of_line(min_vertex, max_vertex, vertex);
        if (side === 1) {
            side_one.push(vertex);
        } else if (side === -1) {
            side_two.push(vertex);
        }
    })

    get_hull(min_vertex, max_vertex, side_one, hull);
    get_hull(max_vertex, min_vertex, side_two, hull);
}

function error_check() {}

function scale_everything() {
    function get_new_coords(c, side_length) {
        let new_square_coords = 0.5*(max_width - side_length)
        let new_x = (c.x - new_square_coords) / scale_factor;
        let new_y = (c.y - new_square_coords) / scale_factor;

        //check if outside bounding square
        if (new_x > max_width) {
            new_x -= (new_x - max_width);
        }
        else if (new_x < 0) {
            new_x += (0 - new_x);
        }

        if (new_y > max_width) {
            new_y -= (new_y - max_width);
        }

        else if (new_y < 0) {
            new_y += (0 - new_y);
        }

        return [new_x, new_y];
    }

    function reset_vertex_radii() {
        vertices.forEach((vertex) => {
            vertex.scaled = false
            update_radii();
            draw_graph();
        })
    }

    square_side_length = c_canvas.width;
    square_x = (c_canvas.width - square_side_length) / 2;
    square_y = (c_canvas.height - square_side_length) / 2;
    is_square_minimum_size = false;
    circles.splice(0, circles.length)
    scale_factor = 1;
    reset_vertex_radii();

    get_circles();

    loop().then(data => {
        let new_circles = data.c;
        let new_side_length = data.s;
        console.log("good stuff", new_circles, new_side_length);
        scale_factor = new_side_length/max_width;

        vertices.forEach((v) => {
            new_circles.forEach((c) => {
                if (v.node_id === c.id) {
                    [v.x, v.y] = get_new_coords(c, new_side_length)
                    v.scaled=true;
                }
            })
        })

        update_active_paths();
        update_convex_hull();
        draw_graph();


    }).catch(cont => {
        // wait
        console.error(cont);
    });
}

function update_active_paths() {
    let error = 10;
    active_paths.splice(0, active_paths.length);
    for (let i=0; i < vertices.length; i++) {
        for (let j=i+1; j < vertices.length; j++) {
            let actual_length = get_actual_length(vertices[i], vertices[j]);
            let total_radius = (vertices[i].vertex_radius + vertices[j].vertex_radius)*visual_scale_factor*(1/scale_factor);
            if (actual_length <= total_radius + error) {
                active_paths.push([vertices[i], vertices[j]]);
            }
        }
    }
}

function get_graph() {
    function merge_arrays() {
        // hull + active_paths, both [node, node]
        let hull_ids = [];
        let active_path_ids = [];
        hull.forEach((pair) => {
            hull_ids.push([pair[0].node_id, pair[1].node_id]);
        })
        active_paths.forEach((pair) => {
            active_path_ids.push([pair[0].node_id, pair[1].node_id]);
        })

        let merged = [];
        hull_ids.forEach((h) => {
            merged.push(h);
        })
        active_path_ids.forEach((a) => {
            let extant = false;
            hull_ids.forEach((h) => {
                if (h.includes(a[0]) && h.includes(a[1])) {
                    extant = true;
                }
            })
            if (!extant) {
                merged.push(a)
            }
        })
        return merged;
    }

    const combo_graph = merge_arrays();

    let graph_nodes = {};


    combo_graph.forEach((node_pair) => {
        if (!((node_pair[0]) in graph_nodes)) {
            graph_nodes[(node_pair[0])] = [];
        }
        if (!((node_pair[1]) in graph_nodes)) {
            graph_nodes[(node_pair[1])] = [];
            graph_nodes[(node_pair[1])].push((node_pair[0]));
        }
        if (!graph_nodes[(node_pair[0])].includes((node_pair[1]))) {
            graph_nodes[(node_pair[0])].push((node_pair[1]));
        }
        if (!graph_nodes[(node_pair[1])].includes((node_pair[0]))) {
            graph_nodes[(node_pair[1])].push((node_pair[0]));
        }
    })

    return [combo_graph, graph_nodes];
}
function get_polygons() {
    function get_triangles() {
        // return 3 edges with the type (active or not)
        const triangles = [];
        polygons.forEach((poly) => {
            if (poly.length === 3) {
                let tri_nodes = [];
                let triangle = [];
                poly.forEach((p) => {
                    tri_nodes.push(p);
                })

                tri_nodes.push(tri_nodes[0]);
                for (let i=0; i < tri_nodes.length-1; i++) {
                    let edge_ids = [tri_nodes[i], tri_nodes[i+1]];
                    let active = false;
                    active_paths.forEach((pair) => {
                        if (edge_ids.includes(pair[0].node_id) && edge_ids.includes(pair[1].node_id)) {
                            active = true
                        }
                    })
                    triangle.push([edge_ids, active]);
                }
                triangles.push([poly, triangle]);
            }
        })
        return triangles;
    }
    function get_quads() {
        // return 4 edges with the type (active or not)
        const quads = [];
        polygons.forEach((poly) => {
            if (poly.length === 4) {
                let quad_nodes = [];
                let quad = [];
                poly.forEach((p) => {
                    quad_nodes.push(p);
                })

                quad_nodes.push(quad_nodes[0]);
                for (let i=0; i < quad_nodes.length-1; i++) {
                    let edge_ids = [quad_nodes[i], quad_nodes[i+1]];
                    let active = false;
                    active_paths.forEach((pair) => {
                        if (edge_ids.includes(pair[0].node_id) && edge_ids.includes(pair[1].node_id)) {
                            active = true
                        }
                    })
                    quad.push([edge_ids, active]);
                }
                quads.push([poly, quad]);
            }
        })
        return quads;
    }

    const [combo_graph, graph_nodes_id] = get_graph();
    const no_edges = combo_graph.length;
    const all_polygons = [];

    for (const start_node_id in graph_nodes_id) {
        let start_adj_nodes_id = graph_nodes_id[start_node_id];

        start_adj_nodes_id.forEach((node_id) => {
            let polygon = [parseInt(start_node_id), parseInt(node_id)];
            let count = 0;

            while (!(polygon[0] === polygon[polygon.length-1] || count > no_edges || polygon[polygon.length-1] === null)) {
                let prev_node_id = parseInt(polygon[polygon.length-2]);
                let curr_node_id = parseInt(polygon[polygon.length-1]);
                let adj_nodes_id = [];
                graph_nodes_id[curr_node_id].forEach((item) => {
                    adj_nodes_id.push((item));
                });

                adj_nodes_id.splice(adj_nodes_id.indexOf(prev_node_id), 1);

                let prev_node = get_node_from_id(prev_node_id);
                let curr_node = get_node_from_id(curr_node_id);

                if (adj_nodes_id.length === 1) {
                    polygon.push(adj_nodes_id[0]);
                }
                else if (adj_nodes_id.length > 1) {

                    let min_angle = 181;
                    let min_id = null;

                    adj_nodes_id.forEach((a_node_id) => {
                        let node = get_node_from_id(parseInt(a_node_id))
                        let angle = get_angle(curr_node, prev_node, node)
                        if (angle < min_angle) {
                            min_angle = angle;
                            min_id = a_node_id;
                        }
                    })
                    polygon.push(min_id);
                }
                count++;
            }

            if (polygon[0] === polygon[polygon.length-1]) {
                polygon.splice(polygon.length-1, 1)
                all_polygons.push(polygon);
            }
        });
    }

    const polygons =  remove_duplicates_in_array(all_polygons);
    const triangles = get_triangles();
    const quads = get_quads();
    return [triangles, quads];
}

function update_creases() {
    function update_modular_triangle_creases(triangles) {
        // format tri: [[nodes_id], [edges]]
        //format edge: [[node1 id, node2 id], active(bool)]
        triangles.forEach((t) => {
            const n_0 = get_node_from_id(t[0][0]);
            const n_1 = get_node_from_id(t[0][1]);
            const n_2 = get_node_from_id(t[0][2]);

            const d_01 = get_actual_length(n_0, n_1);
            const d_12 = get_actual_length(n_1, n_2);
            const d_20 = get_actual_length(n_2, n_0);

            const x_pos = (n_0.x * d_12 + n_1.x * d_20 + n_2.x * d_01) / (d_01 + d_12 + d_20);
            const y_pos = (n_0.y * d_12 + n_1.y * d_20 + n_2.y * d_01) / (d_01 + d_12 + d_20);

            const incenter = {x: x_pos, y: y_pos};

            [n_0, n_1, n_2].forEach((n) => {
                creases.push([n, incenter]);
            })

            t[1].forEach((edge) => {
                if (!edge[1]) {
                    const adj_edges = t[1].filter((item) => item !== edge);
                    console.log("edge: ", edge, "adj edges: ", adj_edges);
                    adj_edges.forEach((e) => {
                        console.log("curr_adj_edge: ", e);
                        let base_node_1 = get_node_from_id(edge[0][0]);
                        let base_node_2 = get_node_from_id(edge[0][1]);

                        let start_node_id = e[0][0];
                        let end_node_id = e[0][1]
                        let shared_node_id = null;
                        let other_node_id = null;

                        console.log("e: ", e);

                        if (edge[0].includes(start_node_id)) {
                            shared_node_id = start_node_id;
                            other_node_id = end_node_id;
                        }

                        if (edge[0].includes(end_node_id)) {
                            shared_node_id = end_node_id;
                            other_node_id = start_node_id;
                        }

                        console.log("ids: ", start_node_id, end_node_id, shared_node_id, other_node_id);

                        let shared_node = get_node_from_id(shared_node_id);
                        let other_node = get_node_from_id(other_node_id);

                        console.log(base_node_1, base_node_2, shared_node, other_node);

                        let mp = {x: 0.5*(shared_node.x + other_node.x), y: 0.5*(shared_node.y + other_node.y)};
                        let base_line = get_line(base_node_1, base_node_2);
                        let pb_line = get_perpendicular_bisector(shared_node, other_node);
                        let incenter_line = get_line(shared_node, incenter);
                        let root_line = get_line(other_node, incenter);
                        let ic_pb_intersect_point = get_intersection(pb_line, incenter_line);
                        // get line with root line m that crosses that point
                        let trunk_c = ic_pb_intersect_point.y - (ic_pb_intersect_point.x * root_line[0]);
                        let trunk_line = [root_line[0], trunk_c];
                        let tr_e_intersect_point = get_intersection(trunk_line, base_line);
                        let base_line_mp = {x:0.5 * (base_node_1.x + base_node_2.x), y:0.5 * (base_node_1.y + base_node_2.y)}

                        console.log("points: ", ic_pb_intersect_point, tr_e_intersect_point);

                        creases.push([ic_pb_intersect_point, tr_e_intersect_point]);
                        creases.push([ic_pb_intersect_point, mp]);
                        creases.push([other_node, base_line_mp]);
                        creases.push([shared_node, other_node]);
                    })

                    // const conn = connections.filter((connection) => (connection.connection_id === conn_id))[0]
                }
            })

        })
    }
    function update_modular_quad_creases(quadrilaterals) {}

    creases.splice(0, creases.length);

    const [tris, quads] = get_polygons();
    update_modular_triangle_creases(tris);
    update_modular_quad_creases(quads);
    draw_graph();
}


function get_angle(a, b, c) {
    // angle at a with ab as base
    const vec_ab = { x: b.x - a.x, y: b.y - a.y };
    const vec_ac = { x: c.x - a.x, y: c.y - a.y };
    const dot_prod = (vec_ab.x * vec_ac.x) + (vec_ab.y * vec_ac.y);
    const mag_ab = Math.sqrt((vec_ab.x ** 2) + (vec_ab.y ** 2));
    const mag_ac = Math.sqrt((vec_ac.x ** 2) + (vec_ac.y ** 2));
    const cross_prod = (vec_ab.x * vec_ac.y) - (vec_ab.y * vec_ac.x);
    let angle_deg = Math.acos(dot_prod / (mag_ab * mag_ac)) * (180 / Math.PI);

    if (cross_prod < 0) {
        // Clockwise angle
        angle_deg = 360 - angle_deg;
    }

    return angle_deg;
}

function remove_duplicates_in_array(array) {
    const seen = new Set();
    const stringify_and_sort = (a) => a.slice().sort().join(',');

    const unique_arrays = array.filter((a) => {
        const sorted_string = stringify_and_sort(a);
        if (seen.has(sorted_string)) {
            return false;
        } else {
            seen.add(sorted_string);
            return true;
        }
    });

    return unique_arrays;
}

function get_line(start_node, end_node) {
    let m = (start_node.y - end_node.y) / (start_node.x - end_node.x);
    let c = start_node.y - (m * start_node.x);
    return [m, c];
}

function get_perpendicular_bisector(n_1, n_2) {
    const mp = [0.5 * (n_1.x + n_2.x), 0.5 * (n_1.y + n_2.y)];
    const m = (n_1.y - n_2.y) / (n_1.x - n_2.x)
    let perp_m = 0;
    let c = 0;

    if (m === Infinity || m === -Infinity) {
        perp_m = 0;
        c = mp[1];
    }
    else if (m === 0) {
        perp_m = Infinity;
        c = 0;
    }
    else {
        perp_m = -1/m;
        c = mp[1] - perp_m * mp[0];
    }

    return [perp_m, c];
}

function get_intersection (l1, l2) {
    // lines in format: [m, c]
    if (l1[0] === l2[0]) {
        return null;
    }

    let x_val = (l2[1] - l1[1]) / (l1[0] - l2[0]);
    let y_val = l1[0] * x_val + l1[1];

    return {x:x_val, y:y_val};

}



function get_circles() {
    vertices.forEach((vertex) => {
        const circle = {id:vertex.node_id, radius:vertex.vertex_radius*visual_scale_factor, x:vertex.x, y:vertex.y};
        console.log(circle);
        circles.push(circle);
    })
}

function check_circle_overlap(c1, c2) {
    return Math.sqrt(((c1.x - c2.x)**2) + ((c1.y - c2.y)**2)) < (c1.radius + c2.radius);
}

function square_overlap(circle) {
    if (circle.x <= square_x) { circle.x ++; }
    else if (circle.x >= square_x + square_side_length) { circle.x --; }

    if (circle.y <= square_y) { circle.y ++; }
    else if (circle.y >= square_y + square_side_length) { circle.y --; }
}

function circle_overlap(c1, c2) {
    let dx = c2.x - c1.x;
    let dy = c2.y - c1.y;
    let angle = Math.atan2(dy, dx);
    let overlap = c1.radius + c2.radius - Math.sqrt(dx * dx + dy * dy);

    c1.x -= overlap * Math.cos(angle);
    c1.y -= overlap * Math.sin(angle);
    c2.x += overlap * Math.cos(angle);
    c2.y += overlap * Math.sin(angle);
}

function shrink_square() {
    square_side_length--;
    square_x = (c_canvas.width - square_side_length) / 2;
    square_y = (c_canvas.height - square_side_length) / 2;
    circles.forEach((c) => {
        square_overlap(c);
    })
}

function check_overlaps() {
    function no_overlapping() {
        for (let i=0; i < circles.length; i++) {
            for (let j=i+1; j < circles.length; j++) {
                if (check_circle_overlap(circles[i], circles[j])) {
                    return false;
                }
            }
        }
        return true;
    }

    let no_overlaps = false;
    let count = 0;

    while (count < 2000 && !no_overlaps) {
        for (let i=0; i < circles.length; i++) {
            for (let j = i + 1; j < circles.length; j++) {
                if (check_circle_overlap(circles[i], circles[j])) {
                    circle_overlap(circles[i], circles[j]);
                    square_overlap(circles[i]);
                    square_overlap(circles[j]);
                }
            }
        }
        no_overlaps = no_overlapping();
        count++;
    }

    if (count >= 2000) {
        is_square_minimum_size = true;
    }
}

function update_canvas() {

    c_ctx.clearRect(0, 0, c_canvas.width, c_canvas.height);
    c_ctx.strokeRect(square_x, square_y, square_side_length, square_side_length);

    if (!is_square_minimum_size) {
        shrink_square();
    }
    check_overlaps();

    circles.forEach((c) => {
        c_ctx.beginPath();
        c_ctx.arc(c.x, c.y, c.radius, 0, Math.PI*2);
        c_ctx.fillStyle = "black";
        c_ctx.fill();
        c_ctx.closePath();
    })
}

function loop() {
    return new Promise((resolve, reject) => {
        if (!is_square_minimum_size) {
            update_canvas();
            requestAnimationFrame(() => {
                loop().then(resolve).catch(reject);
            });
        } else {
            console.log("c, s: ", circles, square_side_length);
            resolve({c: circles, s: square_side_length});
        }
    });
}




update_graph();



