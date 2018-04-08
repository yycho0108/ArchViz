

var ArchViz = function(svg, graph){
    var self = this;

    // canvas
    this.svg = svg;
    this.g_link = svg.append("g").attr("class", "links");
    this.g_hull = svg.append("g").attr("class", "hulls");
    this.g_node = svg.append("g").attr("class", "nodes");

    var width = svg.attr("width");
    var height = svg.attr("height");


    // graphics parameters
    this.g_params = {
        "color" : d3.scaleSequential(function(t){return d3.interpolateRainbow(t/20.0);})
    };

    // data
    this.graph = graph;
    this.root = graph.root;
    this.data_nodes = graph.nodes;
    this.data_links = graph.links;
    this.data_hulls = [];

    // initial setup ...
    graph.nodes.forEach(function(node){
        node.expanded = false;
        node.hidden = false;
    });

    // visual
    this.nodes = null;
    this.links = null;

    // simulation
    this.simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(function (d) {
            return d.id;
        }))
        .force("charge", d3.forceManyBody())
        .force("center", d3.forceCenter(width / 2, height / 2));


    this.restart();

    this.simulation.on("tick", function(){self.onTick();});
};

function getPoints(root, index, depth){
    var res = [];
    root.children.forEach(function(c){
        res.push(c);
        res = res.concat(getPoints(c, index, depth+1));
    });
    index.push({
        "id" : "h-" + root.id,
        "name" : root.name,
        "points" : res,
        "depth" : depth
    });
    return res;
}

function updateHullPoints(nodeid, nodes, delta){

    delta = (typeof delta === 'undefined' ? 5.0 : delta);

    var res = null;
    nodes.forEach(function(node){
        if(node.id === nodeid){
            res = [[node.x, node.y]];

            if(node.expanded && node.children.length > 0){
                node.children.forEach(function(c){
                    res = res.concat(updateHullPoints(c.id, nodes, delta));
                });
            }

            if(res.length >= 3){
                res = d3.polygonHull(res);
                res = expandPoints(res, 5.0);
            }
            node.hull = res;
        }
    });
    return res;
}

ArchViz.prototype.rebuild = function(){
    // rebuild on change(), where a node is expanded

    // 1. only account for visible nodes:
    // expanded nodes are treated as hulls around visible nodes.
    var nodes = [this.root];
    var leafs = [];

    while(nodes.length > 0){
        var next = [];
        for(var ni in nodes){
            var node = nodes[ni];
            leafs.push(node);
            if(node.children.length > 0 && node.expanded){
                for(var ci in node.children){
                    var child = node.children[ci];
                    next.push(child);
                }
            }
        }
        nodes = next;
    }

    // 2. resolve links for hidden child nodes
    var lids = leafs.map(function(e){return e.id;});

    console.log("lids", lids);
    console.log("lids", this.graph.links);

    var links = [];
    for(var li in this.graph.links){
        var link = this.graph.links[li];
        if(lids.indexOf(link.source)>=0 && lids.indexOf(link.target)>=0){
            links.push(link);
        }else if(lids.indexOf(link.source.id)>=0 && lids.indexOf(link.target.id)>=0){
            links.push(link);
        }
        // if link.source in visible_nodes and link.target in visible_nodes:
        // ...
    }
    console.log("links", links);

    // 3. create hulls definitions
    var hulls  = [];
    getPoints(this.root, hulls, 0);
    console.log(hulls);

    this.data_nodes = leafs;
    this.data_links = links;
    this.data_hulls = hulls;

    // fallback : ignore all flags
    // this.data_nodes = this.graph.nodes;
    // this.data_links = this.graph.links;
};

ArchViz.prototype.dragstarted = function(d) {
    if (!d3.event.active){
        this.simulation.alphaTarget(0.3).restart();
    }
    d.fx = d.x;
    d.fy = d.y;
};
ArchViz.prototype.dragged = function(d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
};

ArchViz.prototype.dragended = function(d) {
    if (!d3.event.active){
        this.simulation.alphaTarget(0);
    }
    d.fx = null;
    d.fy = null;
};

ArchViz.prototype.update = function(){
    var self = this;

    var node = this.g_node
        .selectAll("circle")
        .data(this.data_nodes, function(d){return d.id + "" +  d.expanded;});
    node.exit().remove(); // remove old ones

    var new_leafs = node.enter().filter(function(d){return !d.expanded});
    console.log("leafs", new_leafs);

    var new_nodes = node.enter()
        .append("circle") // add new ones
        .attr("id", function(d){return d.id;})
        .attr("r", 5)
        .on("mousedown", function(){
            var id=d3.select(this).attr("id");
            self.data_nodes.forEach(function(e){
                if(e.id === id && e.children.length > 0){
                    e.expanded = !e.expanded;
                    self.restart();
                }
            });
        })
        .attr("visibility", function(d){
            //return "visible";
            //return (d.expanded || d.hidden)?"hidden":"visible";
            return d.hidden?"hidden":"visible";
        })
        //.attr("fill", function(d) { return color(d.group); })
        .call(d3.drag()
            .on("start", function(d){return self.dragstarted(d);})
            .on("drag", function(d){return self.dragged(d);})
            .on("end", function(d){return self.dragended(d);}));
    new_nodes.append("title")
        .text(function (d) {
            return d.name;
        });
    this.nodes = new_nodes.merge(node);

    var link = this.g_link
        .selectAll("line")
        .data(this.data_links, function(d){return d.id});
    link.exit().remove(); // remove old ones
    this.links = link.enter().append("line") // add new ones
        .attr("id", function(d){
            return d.id;
        })
        .attr("stroke-width", function (d) {
            return 1.0;
        })//Math.sqrt(d.value); });
        .merge(link); // old + new

    console.log(this.nodes);

    // 3. create hulls
    var hull = this.g_hull
        .selectAll("path")
        .data(this.data_hulls, function(d){return d.id;});
    hull.exit().remove();
    var new_hulls = hull.enter().append("path")
        .attr("stroke-width", 2.0)
        .attr("stroke", 'white')
        .attr("fill-opacity", 0.2)
        .attr("fill", function(d, i){return self.g_params["color"](i);})
        .on("mousedown", function(){
            var id=d3.select(this).attr("id");
            self.data_nodes.forEach(function(e){
                if("h-"+e.id === id){
                    e.expanded = !e.expanded;
                    self.restart();
                }
            });
        });

    new_hulls.append("title")
        .text(function (d) {
            return d.name;
        });

    this.hulls = new_hulls.merge(hull);
    this.hulls.sort(function(a,b){
        if(a.depth < b.depth) return -1;
        else if (a.id < b.id) return -1;
        else return 1;
    })
};

ArchViz.prototype.restart = function(){
    this.rebuild();
    this.update();

    // Update and restart the simulation.
    this.simulation.nodes(this.data_nodes);
    this.simulation.force("link").links(this.data_links);
    this.simulation.alpha(1).restart();
};

ArchViz.prototype.onTick = function(){
    var self = this;

    this.links
        .attr("x1", function (d) {
            return d.source.x;
        })
        .attr("y1", function (d) {
            return d.source.y;
        })
        .attr("x2", function (d) {
            return d.target.x;
        })
        .attr("y2", function (d) {
            return d.target.y;
        })
        .attr("visibility", function (d) {
            var hidden = (typeof d.hidden === 'undefined' ? false : d.hidden);
            return hidden ? "hidden" : "visible";
        });

    this.nodes
        .attr("cx", function (d) {
            return d.x;
        })
        .attr("cy", function (d) {
            return d.y;
        });

    updateHullPoints(self.root.id, self.data_nodes, 10);

    this.hulls
        .attr("id", function(d){return d.id;})
        .attr("d", function(d){
        var hull = null;
            for (var di in self.data_nodes) {
                var dn = self.data_nodes[di];
                if (d.id == "h-" + dn.id) {
                    hull = dn.hull;
                }
        }
        if(hull === null) return "M 0,0";

        return "M" + hull.join(" L") + " Z";
    });
};

function expandPoints(points, delta){
    var n = points.length;

    var new_points = [];

    for(var i=0; i<n; ++i){
        var dx0 = points[i][0] - points[(i+n-1)%n][0];
        var dy0 = points[i][1] - points[(i+n-1)%n][1];
        var r0 = Math.sqrt(dx0*dx0+dy0*dy0);
        dx0 /= r0;
        dy0 /= r0;

        var dx1 = points[(i+1)%n][0] - points[i][0];
        var dy1 = points[(i+1)%n][1] - points[i][1];
        var r1 = Math.sqrt(dx1*dx1+dy1*dy1);
        dx1 /= r1;
        dy1 /= r1;

        var c = -dy0;
        var d = -dy1;
        var e = dx0;
        var f = dx1;
        var g = delta;

        var a = (g*e-g*f)/(e*d-c*f);
        var b = (g-a*c)/e;

        new_points.push([points[i][0]+a, points[i][1]+b]);
    }

    return new_points;
}
function archbuild(graph, svg, width, height) {

    // svg.append("defs")
    //     .append("marker")
    //     .attr("class", "arrow")
    //     .attr("id", function (d) {
    //         return "triangle";
    //     })
    //     .attr("refX", function (d) {
    //         return 6;
    //     })
    //     .attr("refY", function (d) {
    //         return 6;
    //     })
    //     .attr("markerWidth", 30)
    //     .attr("markerHeight", 30)
    //     .attr("orient", "auto")
    //     .append("path")
    //     .attr("d", "M 0 0 12 6 0 12 3 6");

    var link = svg.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(graph.links)
        .enter().append("line")
        .attr("stroke-width", function (d) {
            return 1.0;
        });//Math.sqrt(d.value); });

    var node = svg.append("g")
        .attr("class", "nodes")
        .selectAll("circle")
        .data(graph.nodes)
        .enter().append("circle")
        .attr("r", 5)
        //.attr("fill", function(d) { return color(d.group); })
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));

    node.append("title")
        .text(function (d) {
            return d.id;
        });

    simulation
        .nodes(graph.nodes)
        .on("tick", ticked);

    simulation.force("link")
        .links(graph.links);

    function ticked() {
        link
            .attr("x1", function (d) {
                return d.source.x;
            })
            .attr("y1", function (d) {
                return d.source.y;
            })
            .attr("x2", function (d) {
                return d.target.x;
            })
            .attr("y2", function (d) {
                return d.target.y;
            })
            .attr("visibility", function (d) {
                var hidden = (typeof d.hidden === 'undefined' ? false : d.hidden);
                return hidden ? "hidden" : "visible";
            });

        node
            .attr("cx", function (d) {
                return d.x;
            })
            .attr("cy", function (d) {
                return d.y;
            });


    }



    function restart() {
        // Apply the general update pattern to the nodes.
        node = node.data(nodes, function(d) { return d.id;});
        node.exit().remove();
        node = node.enter().append("circle").attr("fill", function(d) { return color(d.id); }).attr("r", 8).merge(node);

        // Apply the general update pattern to the links.
        link = link.data(links, function(d) { return d.source.id + "-" + d.target.id; });
        link.exit().remove();
        link = link.enter().append("line").merge(link);

        // Update and restart the simulation.
        simulation.nodes(nodes);
        simulation.force("link").links(links);
        simulation.alpha(0.5).restart();
    }
}
