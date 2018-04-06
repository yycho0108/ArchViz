

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
        "points" : res,
        "depth" : depth
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
            // TODO : enable region click to toggle visibility
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
    this.hulls = hull.enter().append("path")
        .attr("stroke-width", 1.0)
        .attr("fill-opacity", 0.1)
        .on("mousedown", function(){
            var id=d3.select(this).attr("id");
            self.data_nodes.forEach(function(e){
                if("h-"+e.id === id){
                    e.expanded = !e.expanded;
                    self.restart();
                }
            });
        })
        .merge(hull);
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


    this.hulls
        .attr("id", function(d){return d.id;})
        .attr("d", function(d){
        var x0, y0;
        for(var di in self.data_nodes){
            var dn = self.data_nodes[di];
            if (d.id === "h-"+dn.id){
                x0=dn.x;
                y0=dn.y;
            }
        }

        var points = [[x0,y0]];
        for(var pi in d.points){
            var p = d.points[pi];

            for(var di in self.data_nodes){
                var dn = self.data_nodes[di];
                if (p.id === dn.id){
                   points = points.concat([[p.x, p.y]]);
                }
            }
        }

        var hull = d3.polygonHull(points);
        if(hull === null) return "M 0,0";
        // console.log("points", points);
        // console.log("hull", hull);
        // console.log("hull", hull.join(" L"));

        return "M" + hull.join(" L") + " Z";
    });
};

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
