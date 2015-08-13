'use strict';

var svg, tooltip, biHiSankey, path, defs, colorScale, highlightColorScale, isTransitioning;

var OPACITY = {
    NODE_DEFAULT: 0.9,
    NODE_FADED: 0.1,
    NODE_HIGHLIGHT: 0.8,
    LINK_DEFAULT: 0.6,
    LINK_FADED: 0.05,
    LINK_HIGHLIGHT: 0.9
  },
  TYPES = ["Chapters", "Expense", "Revenue", "Equity", "Liability"],
  TYPE_COLORS = ["#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#66a61e", "#e6ab02", "#a6761d"],
  TYPE_HIGHLIGHT_COLORS = ["#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f", "#e5c494"],
  LINK_COLOR = "#b3b3b3",
  INFLOW_COLOR = "#2E86D1",
  OUTFLOW_COLOR = "#D63028",
  NODE_WIDTH = 36,
  COLLAPSER = {
    RADIUS: NODE_WIDTH / 2,
    SPACING: 2
  },
  OUTER_MARGIN = 10,
  MARGIN = {
    TOP: 2 * (COLLAPSER.RADIUS + OUTER_MARGIN),
    RIGHT: OUTER_MARGIN,
    BOTTOM: OUTER_MARGIN,
    LEFT: OUTER_MARGIN
  },
  TRANSITION_DURATION = 400,
  HEIGHT = 500 - MARGIN.TOP - MARGIN.BOTTOM,
  WIDTH = 1360 - MARGIN.LEFT - MARGIN.RIGHT,
  LAYOUT_INTERATIONS = 32,
  REFRESH_INTERVAL = 7000;

var formatNumber = function (d) {
  var numberFormat = d3.format(",.0f"); // zero decimal places
  return numberFormat(d);
},

formatFlow = function (d) {
  var flowFormat = d3.format(",.0f"); // zero decimal places with sign
  return flowFormat(Math.abs(d)) + (d < 0 ? " CR" : " DR");
},

// Used when temporarily disabling user interractions to allow animations to complete
disableUserInterractions = function (time) {
  isTransitioning = true;
  setTimeout(function(){
    isTransitioning = false;
  }, time);
},

hideTooltip = function () {
  return tooltip.transition()
    .duration(TRANSITION_DURATION)
    .style("opacity", 0);
},

showTooltip = function () {
  return tooltip
    .style("left", d3.event.pageX + "px")
    .style("top", d3.event.pageY + 15 + "px")
    .transition()
      .duration(TRANSITION_DURATION)
      .style("opacity", 1);
};

colorScale = d3.scale.ordinal().domain(TYPES).range(TYPE_COLORS),
highlightColorScale = d3.scale.ordinal().domain(TYPES).range(TYPE_HIGHLIGHT_COLORS),

svg = d3.select("#chart").append("svg")
        .attr("width", WIDTH + MARGIN.LEFT + MARGIN.RIGHT +1000)
        .attr("height", HEIGHT + MARGIN.TOP + MARGIN.BOTTOM +1000)
      .append("g")
        .attr("transform", "translate(" + MARGIN.LEFT + "," + MARGIN.TOP + ")");

svg.append("g").attr("id", "links");
svg.append("g").attr("id", "nodes");
svg.append("g").attr("id", "collapsers");

tooltip = d3.select("#chart").append("div").attr("id", "tooltip");

tooltip.style("opacity", 0)
    .append("p")
      .attr("class", "value");

biHiSankey = d3.biHiSankey();

// Set the biHiSankey diagram properties
biHiSankey
  .nodeWidth(NODE_WIDTH)
  .nodeSpacing(10)
  .linkSpacing(4)
  .arrowheadScaleFactor(0.5) // Specifies that 0.5 of the link's stroke WIDTH should be allowed for the marker at the end of the link.
  .size([WIDTH, HEIGHT]);

path = biHiSankey.link().curvature(0.45);

defs = svg.append("defs");

defs.append("marker")
  .style("fill", LINK_COLOR)
  .attr("id", "arrowHead")
  .attr("viewBox", "0 0 6 10")
  .attr("refX", "1")
  .attr("refY", "5")
  .attr("markerUnits", "strokeWidth")
  .attr("markerWidth", "10")
  .attr("markerHeight", "1")
  .attr("orient", "auto")
  .append("path")
    .attr("d", "M 0 0 L 1 0 L 6 5 L 1 10 L 0 10 z");

defs.append("marker")
  .style("fill", OUTFLOW_COLOR)
  .attr("id", "arrowHeadInflow")
  .attr("viewBox", "0 0 6 10")
  .attr("refX", "1")
  .attr("refY", "5")
  .attr("markerUnits", "strokeWidth")
  .attr("markerWidth", "1")
  .attr("markerHeight", "1")
  .attr("orient", "auto")
  .append("path")
    .attr("d", "M 0 0 L 1 0 L 6 5 L 1 10 L 0 10 z");

defs.append("marker")
  .style("fill", INFLOW_COLOR)
  .attr("id", "arrowHeadOutlow")
  .attr("viewBox", "0 0 6 10")
  .attr("refX", "1")
  .attr("refY", "5")
  .attr("markerUnits", "strokeWidth")
  .attr("markerWidth", "1")
  .attr("markerHeight", "1")
  .attr("orient", "auto")
  .append("path")
    .attr("d", "M 0 0 L 1 0 L 6 5 L 1 10 L 0 10 z");

function update () {
  var link, linkEnter, node, nodeEnter, collapser, collapserEnter;

  function dragmove(node) {
    node.x = Math.max(0, Math.min(WIDTH - node.width, d3.event.x));
    node.y = Math.max(0, Math.min(HEIGHT - node.height, d3.event.y));
    d3.select(this).attr("transform", "translate(" + node.x + "," + node.y + ")");
    biHiSankey.relayout();
    svg.selectAll(".node").selectAll("rect").attr("height", function (d) { return d.height; });
    link.attr("d", path);
  }

  function containChildren(node) {
    node.children.forEach(function (child) {
      child.state = "contained";
      child.parent = this;
      child._parent = null;
      containChildren(child);
    }, node);
  }

  function expand(node) {
    node.state = "expanded";
    node.children.forEach(function (child) {
      child.state = "collapsed";
      child._parent = this;
      child.parent = null;
      containChildren(child);
    }, node);
  }

  function collapse(node) {
    node.state = "collapsed";
    containChildren(node);
  }

  function restoreLinksAndNodes() {
    link
      .style("stroke", LINK_COLOR)
      .style("marker-end", function () { return 'url(#arrowHead)'; })
      .transition()
        .duration(TRANSITION_DURATION)
        .style("opacity", OPACITY.LINK_DEFAULT);

    node
      .selectAll("rect")
        .style("fill", function (d) {
          d.color = colorScale(d.type.replace(/ .*/, ""));
          return d.color;
        })
        .style("stroke", function (d) {
          return d3.rgb(colorScale(d.type.replace(/ .*/, ""))).darker(0.1);
        })
        .style("fill-opacity", OPACITY.NODE_DEFAULT);

    node.filter(function (n) { return n.state === "collapsed"; })
      .transition()
        .duration(TRANSITION_DURATION)
        .style("opacity", OPACITY.NODE_DEFAULT);
  }

  function showHideChildren(node) {
    disableUserInterractions(2 * TRANSITION_DURATION);
    hideTooltip();
    if (node.state === "collapsed") { expand(node); }
    else { collapse(node); }

    biHiSankey.relayout();
    update();
    link.attr("d", path);
    restoreLinksAndNodes();
  }

  function highlightConnected(g) {
    link.filter(function (d) { return d.source === g; })
      .style("marker-end", function () { return 'url(#arrowHeadInflow)'; })
      .style("stroke", OUTFLOW_COLOR)
      .style("opacity", OPACITY.LINK_DEFAULT);

    link.filter(function (d) { return d.target === g; })
      .style("marker-end", function () { return 'url(#arrowHeadOutlow)'; })
      .style("stroke", INFLOW_COLOR)
      .style("opacity", OPACITY.LINK_DEFAULT);
  }

  function fadeUnconnected(g) {
    link.filter(function (d) { return d.source !== g && d.target !== g; })
      .style("marker-end", function () { return 'url(#arrowHead)'; })
      .transition()
        .duration(TRANSITION_DURATION)
        .style("opacity", OPACITY.LINK_FADED);

    node.filter(function (d) {
      return (d.name === g.name) ? false : !biHiSankey.connected(d, g);
    }).transition()
      .duration(TRANSITION_DURATION)
      .style("opacity", OPACITY.NODE_FADED);
  }

  link = svg.select("#links").selectAll("path.link")
    .data(biHiSankey.visibleLinks(), function (d) { return d.id; });

  link.transition()
    .duration(TRANSITION_DURATION)
    .style("stroke-WIDTH", function (d) { return Math.max(1, d.thickness); })
    .attr("d", path)
    .style("opacity", OPACITY.LINK_DEFAULT);


  link.exit().remove();


  linkEnter = link.enter().append("path")
    .attr("class", "link")
    .style("fill", "none");

  linkEnter.on('mouseenter', function (d) {
    if (!isTransitioning) {
      showTooltip().select(".value").text(function () {
        if (d.direction > 0) {
          return d.source.name + "  ->  " + d.target.name + "\n" + formatNumber(d.value);
        }
        return d.target.name + "  <-  " + d.source.name + "\n" + formatNumber(d.value);
      });

      d3.select(this)
        .style("stroke", LINK_COLOR)
        .transition()
          .duration(TRANSITION_DURATION / 2)
          .style("opacity", OPACITY.LINK_HIGHLIGHT);
    }
  });

  linkEnter.on('mouseleave', function () {
    if (!isTransitioning) {
      hideTooltip();

      d3.select(this)
        .style("stroke", LINK_COLOR)
        .transition()
          .duration(TRANSITION_DURATION / 2)
          .style("opacity", OPACITY.LINK_DEFAULT);
    }
  });

  linkEnter.sort(function (a, b) { return b.thickness - a.thickness; })
    .classed("leftToRight", function (d) {
      return d.direction > 0;
    })
    .classed("rightToLeft", function (d) {
      return d.direction < 0;
    })
    .style("marker-end", function () {
      return 'url(#arrowHead)';
    })
    .style("stroke", LINK_COLOR)
    .style("opacity", 0)
    .transition()
      .delay(TRANSITION_DURATION)
      .duration(TRANSITION_DURATION)
      .attr("d", path)
      .style("stroke-WIDTH", function (d) { return Math.max(1, d.thickness); })
      .style("opacity", OPACITY.LINK_DEFAULT);


  node = svg.select("#nodes").selectAll(".node")
      .data(biHiSankey.collapsedNodes(), function (d) { return d.id; });


  node.transition()
    .duration(TRANSITION_DURATION)
    .attr("transform", function (d) { return "translate(" + d.x + "," + d.y + ")"; })
    .style("opacity", OPACITY.NODE_DEFAULT)
    .select("rect")
      .style("fill", function (d) {
        d.color = colorScale(d.type.replace(/ .*/, ""));
        return d.color;
      })
      .style("stroke", function (d) { return d3.rgb(colorScale(d.type.replace(/ .*/, ""))).darker(0.1); })
      .style("stroke-WIDTH", "1px")
      .attr("height", function (d) { return d.height; })
      .attr("width", biHiSankey.nodeWidth());


  node.exit()
    .transition()
      .duration(TRANSITION_DURATION)
      .attr("transform", function (d) {
        var collapsedAncestor, endX, endY;
        collapsedAncestor = d.ancestors.filter(function (a) {
          return a.state === "collapsed";
        })[0];
        endX = collapsedAncestor ? collapsedAncestor.x : d.x;
        endY = collapsedAncestor ? collapsedAncestor.y : d.y;
        return "translate(" + endX + "," + endY + ")";
      })
      .remove();


  nodeEnter = node.enter().append("g").attr("class", "node");

  nodeEnter
    .attr("transform", function (d) {
      var startX = d._parent ? d._parent.x : d.x,
          startY = d._parent ? d._parent.y : d.y;
      return "translate(" + startX + "," + startY + ")";
    })
    .style("opacity", 1e-6)
    .transition()
      .duration(TRANSITION_DURATION)
      .style("opacity", OPACITY.NODE_DEFAULT)
      .attr("transform", function (d) { return "translate(" + d.x + "," + d.y + ")"; });

  nodeEnter.append("text");
  nodeEnter.append("rect")
    .style("fill", function (d) {
      d.color = colorScale(d.type.replace(/ .*/, ""));
      return d.color;
    })
    .style("stroke", function (d) {
      return d3.rgb(colorScale(d.type.replace(/ .*/, ""))).darker(0.1);
    })
    .style("stroke-WIDTH", "1px")
    .attr("height", function (d) { return d.height; })
    .attr("width", biHiSankey.nodeWidth());

  node.on("mouseenter", function (g) {
    if (!isTransitioning) {
      restoreLinksAndNodes();
      highlightConnected(g);
      fadeUnconnected(g);

      d3.select(this).select("rect")
        .style("fill", function (d) {
          d.color = d.netFlow > 0 ? INFLOW_COLOR : OUTFLOW_COLOR;
          return d.color;
        })
        .style("stroke", function (d) {
          return d3.rgb(d.color).darker(0.1);
        })
        .style("fill-opacity", OPACITY.LINK_DEFAULT);

      tooltip
        .style("left", g.x + MARGIN.LEFT + "px")
        .style("top", g.y + g.height + MARGIN.TOP + 15 + "px")
        .transition()
          .duration(TRANSITION_DURATION)
          .style("opacity", 1).select(".value")
          .text(function () {
            var additionalInstructions = g.children.length ? "\n(Double click to expand)" : "";
            return g.name + "\nNet flow: " + formatNumber(g.netFlow) + " target links"+ additionalInstructions;
          });
    }
  });

  node.on("mouseleave", function () {
    if (!isTransitioning) {
      hideTooltip();
      restoreLinksAndNodes();
    }
  });

  node.filter(function (d) { return d.children.length; })
    .on("dblclick", showHideChildren);

  // allow nodes to be dragged to new positions
  node.call(d3.behavior.drag()
    .origin(function (d) { return d; })
    .on("dragstart", function () { this.parentNode.appendChild(this); })
    .on("drag", dragmove));

  // add in the text for the nodes
  node.filter(function (d) { return d.value !== 0; })
    .select("text")
      .attr("x", -6)
      .attr("y", function (d) { return d.height / 2; })
      .attr("dy", ".35em")
      .attr("text-anchor", "end")
      .attr("transform", null)
      .text(function (d) { return d.name; })
    .filter(function (d) { return d.x < WIDTH / 2; })
      .attr("x", 6 + biHiSankey.nodeWidth())
      .attr("text-anchor", "start");


  collapser = svg.select("#collapsers").selectAll(".collapser")
    .data(biHiSankey.expandedNodes(), function (d) { return d.id; });


  collapserEnter = collapser.enter().append("g").attr("class", "collapser");

  collapserEnter.append("circle")
    .attr("r", COLLAPSER.RADIUS)
    .style("fill", function (d) {
      d.color = colorScale(d.type.replace(/ .*/, ""));
      return d.color;
    });

  collapserEnter
    .style("opacity", OPACITY.NODE_DEFAULT)
    .attr("transform", function (d) {
      return "translate(" + (d.x + d.width / 2) + "," + (d.y + COLLAPSER.RADIUS) + ")";
    });

  collapserEnter.on("dblclick", showHideChildren);

  collapser.select("circle")
    .attr("r", COLLAPSER.RADIUS);

  collapser.transition()
    .delay(TRANSITION_DURATION)
    .duration(TRANSITION_DURATION)
    .attr("transform", function (d, i) {
      return "translate("
        + (COLLAPSER.RADIUS + i * 2 * (COLLAPSER.RADIUS + COLLAPSER.SPACING))
        + ","
        + (-COLLAPSER.RADIUS - OUTER_MARGIN)
        + ")";
    });

  collapser.on("mouseenter", function (g) {
    if (!isTransitioning) {
      showTooltip().select(".value")
        .text(function () {
          return g.name + "\n(Double click to collapse)";
        });

      var highlightColor = highlightColorScale(g.type.replace(/ .*/, ""));

      d3.select(this)
        .style("opacity", OPACITY.NODE_HIGHLIGHT)
        .select("circle")
          .style("fill", highlightColor);

      node.filter(function (d) {
        return d.ancestors.indexOf(g) >= 0;
      }).style("opacity", OPACITY.NODE_HIGHLIGHT)
        .select("rect")
          .style("fill", highlightColor);
    }
  });

  collapser.on("mouseleave", function (g) {
    if (!isTransitioning) {
      hideTooltip();
      d3.select(this)
        .style("opacity", OPACITY.NODE_DEFAULT)
        .select("circle")
          .style("fill", function (d) { return d.color; });

      node.filter(function (d) {
        return d.ancestors.indexOf(g) >= 0;
      }).style("opacity", OPACITY.NODE_DEFAULT)
        .select("rect")
          .style("fill", function (d) { return d.color; });
    }
  });

  collapser.exit().remove();

}

var exampleNodes = [
{"type":"Chapters","id":1,"parent":"Chapters","name":"Chapter 3: The Adjusting Process"},
{"type":"Chapters","id":2,"parent":"Chapters","name":"Chapter 19: Job Order Costing"},
{"type":"Chapters","id":3,"parent":"Chapters","name":"Chapter 4: Completing the Accounting Cycle"},
{"type":"Chapters","id":4,"parent":"Chapters","name":"Chapter 16: Statement of Cash Flows"},
{"type":"Chapters","id":5,"parent":"Chapters","name":"Chapter 9: Receivables"},
{"type":"Chapters","id":6,"parent":"Chapters","name":"Chapter 23: Performance Evaluation Using Variances from Standard Costs"},
{"type":"Chapters","id":7,"parent":"Chapters","name":"Chapter 24: Performance Evaluation for Decentralized Operations"},
{"type":"Chapters","id":8,"parent":"Chapters","name":"Chapter 26: Capital Investment Analysis"},
{"type":"Chapters","id":9,"parent":"Chapters","name":"Chapter 7: Inventories"},
{"type":"Chapters","id":10,"parent":"Chapters","name":"Chapter 5: Accounting Systems"},
{"type":"Chapters","id":11,"parent":"Chapters","name":"Chapter 14: Long-Term Liabilities: Bonds and Notes"},
{"type":"Chapters","id":12,"parent":"Chapters","name":"Chapter 20: Process Cost Systems"},
{"type":"Chapters","id":13,"parent":"Chapters","name":"Chapter 6: Accounting for Merchandising Businesses"},
{"type":"Chapters","id":14,"parent":"Chapters","name":"Chapter 25: Differential Analysis, Product Pricing, and Activity-Based Costing"},
{"type":"Chapters","id":15,"parent":"Chapters","name":"Chapter 10: Fixed Assets and Intangible Assets"},
{"type":"Chapters","id":17,"parent":"Chapters","name":"Chapter 22: Budgeting"},
{"type":"Chapters","id":18,"parent":"Chapters","name":"Chapter 1: Introduction to Accounting and Business"},
{"type":"Chapters","id":19,"parent":"Chapters","name":"Chapter 8: Sarbanes-Oxley, Internal Control, and Cash"},
{"type":"Chapters","id":20,"parent":"Chapters","name":"Chapter 21: Cost Behavior and Cost-Volume-Profit Analysis"},
{"type":"Chapters","id":21,"parent":"Chapters","name":"Chapter 13: Corporations: Organization, Stock Transactions, and Dividends"},
{"type":"Chapters","id":22,"parent":"Chapters","name":"Chapter 15: Investments and Fair Value Accounting"},
{"type":"Chapters","id":23,"parent":"Chapters","name":"Chapter 17: Financial Statement Analysis"},
{"type":"Chapters","id":24,"parent":"Chapters","name":"Chapter 11: Current Liabilities and Payroll"},
{"type":"Chapters","id":25,"parent":"Chapters","name":"Chapter 18: Managerial Accounting Concepts and Principles"},
{"type":"Chapters","id":27,"parent":"Chapters","name":"Chapter 2: Analyzing Transactions"},
{"type":"Chapters","id":29,"parent":"Chapters","name":"Chapter 12: Accounting for Partnerships and Limited Liability Companies"},
{"type":"Appendix A: Interest Tables","id":16,"parent":null,"name":"Appendix A: Interest Tables"},
{"type":"Warren_Accounting_25e_RM","id":26,"parent":null,"name":"Warren_Accounting_25e_RM"},
{"type":"Appendix C: Nike, Inc., 2011 Annual Report C-1","id":28,"parent":null,"name":"Appendix C: Nike, Inc., 2011 Annual Report C-1"},
{"type":"Appendix B: Reversing Entries","id":30,"parent":null,"name":"Appendix B: Reversing Entries"},
{"type":"Appendix D: International Financial Reporting Standards (IFRS)","id":31,"parent":null,"name":"Appendix D: International Financial Reporting Standards (IFRS)"}
]

var exampleLinks = [
{"source":18, "target":1, "value":2260},
{"source":26, "target":2, "value":1425},
{"source":26, "target":3, "value":2645},
{"source":26, "target":4, "value":1754},
{"source":26, "target":5, "value":2075},
{"source":26, "target":6, "value":721},
{"source":18, "target":7, "value":72},
{"source":26, "target":8, "value":441},
{"source":18, "target":9, "value":594},
{"source":26, "target":10, "value":1564},
{"source":18, "target":11, "value":376},
{"source":18, "target":12, "value":153},
{"source":18, "target":13, "value":1030},
{"source":18, "target":14, "value":63},
{"source":26, "target":15, "value":2251},
{"source":26, "target":16, "value":108},
{"source":18, "target":17, "value":145},
{"source":26, "target":18, "value":6422},
{"source":26, "target":1, "value":3141},
{"source":18, "target":19, "value":466},
{"source":26, "target":20, "value":1141},
{"source":18, "target":21, "value":532},
{"source":26, "target":22, "value":1256},
{"source":26, "target":11, "value":2051},
{"source":18, "target":23, "value":260},
{"source":18, "target":15, "value":568},
{"source":26, "target":24, "value":1878},
{"source":26, "target":23, "value":1473},
{"source":26, "target":12, "value":1118},
{"source":26, "target":13, "value":2848},
{"source":26, "target":9, "value":2201},
{"source":18, "target":4, "value":288},
{"source":18, "target":20, "value":175},
{"source":18, "target":24, "value":446},
{"source":18, "target":8, "value":55},
{"source":26, "target":7, "value":486},
{"source":26, "target":14, "value":414},
{"source":26, "target":25, "value":1406},
{"source":18, "target":26, "value":7033},
{"source":18, "target":27, "value":7021},
{"source":18, "target":25, "value":323},
{"source":26, "target":21, "value":2572},
{"source":18, "target":28, "value":10},
{"source":26, "target":19, "value":1758},
{"source":18, "target":22, "value":196},
{"source":18, "target":29, "value":442},
{"source":26, "target":17, "value":973},
{"source":26, "target":29, "value":1864},
{"source":18, "target":6, "value":104},
{"source":18, "target":2, "value":241},
{"source":18, "target":5, "value":504},
{"source":18, "target":3, "value":1139},
{"source":18, "target":10, "value":579},
{"source":26, "target":27, "value":3683},
{"source":27, "target":1, "value":4182},
{"source":27, "target":11, "value":25},
{"source":27, "target":17, "value":7},
{"source":27, "target":20, "value":6},
{"source":27, "target":22, "value":17},
{"source":27, "target":24, "value":76},
{"source":27, "target":18, "value":2141},
{"source":27, "target":2, "value":18},
{"source":27, "target":10, "value":390},
{"source":27, "target":21, "value":57},
{"source":27, "target":23, "value":23},
{"source":27, "target":5, "value":199},
{"source":27, "target":19, "value":162},
{"source":27, "target":26, "value":3477},
{"source":27, "target":4, "value":12},
{"source":27, "target":12, "value":3},
{"source":27, "target":15, "value":147},
{"source":27, "target":29, "value":60},
{"source":27, "target":3, "value":1017},
{"source":27, "target":9, "value":268},
{"source":27, "target":25, "value":21},
{"source":27, "target":13, "value":590},
{"source":27, "target":14, "value":4},
{"source":1, "target":27, "value":568},
{"source":1, "target":13, "value":962},
{"source":1, "target":4, "value":10},
{"source":1, "target":29, "value":61},
{"source":1, "target":18, "value":1054},
{"source":1, "target":20, "value":8},
{"source":1, "target":21, "value":46},
{"source":1, "target":25, "value":13},
{"source":1, "target":19, "value":205},
{"source":1, "target":5, "value":263},
{"source":1, "target":15, "value":136},
{"source":1, "target":24, "value":102},
{"source":1, "target":3, "value":3453},
{"source":1, "target":2, "value":13},
{"source":1, "target":17, "value":11},
{"source":1, "target":9, "value":350},
{"source":1, "target":6, "value":2},
{"source":1, "target":11, "value":36},
{"source":1, "target":10, "value":663},
{"source":1, "target":23, "value":12},
{"source":1, "target":26, "value":2910},
{"source":3, "target":5, "value":249},
{"source":3, "target":15, "value":153},
{"source":3, "target":26, "value":2570},
{"source":3, "target":4, "value":34},
{"source":3, "target":19, "value":268},
{"source":3, "target":25, "value":28},
{"source":3, "target":21, "value":44},
{"source":3, "target":20, "value":9},
{"source":3, "target":13, "value":1717},
{"source":3, "target":1, "value":698},
{"source":3, "target":11, "value":20},
{"source":3, "target":10, "value":1612},
{"source":3, "target":22, "value":16},
{"source":3, "target":2, "value":15},
{"source":3, "target":27, "value":225},
{"source":3, "target":29, "value":55},
{"source":3, "target":24, "value":109},
{"source":3, "target":9, "value":449},
{"source":3, "target":12, "value":10},
{"source":3, "target":18, "value":778},
{"source":10, "target":13, "value":1859},
{"source":10, "target":19, "value":234},
{"source":10, "target":15, "value":104},
{"source":10, "target":25, "value":4},
{"source":10, "target":23, "value":7},
{"source":10, "target":27, "value":86},
{"source":10, "target":5, "value":168},
{"source":10, "target":29, "value":30},
{"source":10, "target":18, "value":405},
{"source":10, "target":24, "value":57},
{"source":10, "target":22, "value":9},
{"source":10, "target":9, "value":435},
{"source":10, "target":21, "value":26},
{"source":10, "target":26, "value":1435},
{"source":10, "target":3, "value":251},
{"source":13, "target":18, "value":631},
{"source":13, "target":26, "value":2684},
{"source":13, "target":15, "value":317},
{"source":13, "target":21, "value":73},
{"source":13, "target":17, "value":5},
{"source":13, "target":3, "value":259},
{"source":13, "target":19, "value":903},
{"source":13, "target":2, "value":15},
{"source":13, "target":12, "value":8},
{"source":13, "target":5, "value":645},
{"source":13, "target":25, "value":21},
{"source":13, "target":7, "value":2},
{"source":13, "target":6, "value":6},
{"source":13, "target":11, "value":38},
{"source":13, "target":27, "value":84},
{"source":13, "target":1, "value":158},
{"source":13, "target":9, "value":3057},
{"source":13, "target":20, "value":4},
{"source":13, "target":24, "value":201},
{"source":13, "target":4, "value":39},
{"source":13, "target":10, "value":374},
{"source":13, "target":22, "value":16},
{"source":13, "target":28, "value":4},
{"source":13, "target":29, "value":81},
{"source":9, "target":26, "value":2007},
{"source":9, "target":4, "value":30},
{"source":9, "target":20, "value":5},
{"source":9, "target":23, "value":19},
{"source":9, "target":10, "value":114},
{"source":9, "target":22, "value":18},
{"source":9, "target":1, "value":65},
{"source":9, "target":24, "value":184},
{"source":9, "target":18, "value":471},
{"source":9, "target":17, "value":6},
{"source":9, "target":2, "value":19},
{"source":9, "target":15, "value":530},
{"source":9, "target":5, "value":1054},
{"source":9, "target":29, "value":71},
{"source":9, "target":13, "value":522},
{"source":9, "target":19, "value":2494},
{"source":9, "target":11, "value":26},
{"source":9, "target":21, "value":86},
{"source":9, "target":3, "value":114},
{"source":19, "target":4, "value":21},
{"source":19, "target":7, "value":1},
{"source":19, "target":27, "value":45},
{"source":19, "target":9, "value":515},
{"source":19, "target":5, "value":2560},
{"source":19, "target":15, "value":629},
{"source":19, "target":10, "value":51},
{"source":19, "target":23, "value":16},
{"source":19, "target":21, "value":60},
{"source":19, "target":11, "value":27},
{"source":19, "target":2, "value":13},
{"source":19, "target":24, "value":210},
{"source":19, "target":18, "value":380},
{"source":19, "target":26, "value":1633},
{"source":19, "target":3, "value":64},
{"source":19, "target":13, "value":233},
{"source":19, "target":29, "value":75},
{"source":5, "target":9, "value":315},
{"source":5, "target":14, "value":4},
{"source":5, "target":7, "value":2},
{"source":5, "target":13, "value":146},
{"source":5, "target":23, "value":33},
{"source":5, "target":17, "value":6},
{"source":5, "target":1, "value":64},
{"source":5, "target":20, "value":6},
{"source":5, "target":24, "value":645},
{"source":5, "target":26, "value":1980},
{"source":5, "target":11, "value":66},
{"source":5, "target":25, "value":32},
{"source":5, "target":2, "value":32},
{"source":5, "target":18, "value":452},
{"source":5, "target":19, "value":451},
{"source":5, "target":28, "value":2},
{"source":5, "target":21, "value":161},
{"source":5, "target":29, "value":181},
{"source":5, "target":4, "value":37},
{"source":5, "target":15, "value":2456},
{"source":15, "target":4, "value":102},
{"source":15, "target":27, "value":44},
{"source":15, "target":19, "value":132},
{"source":15, "target":8, "value":6},
{"source":15, "target":25, "value":61},
{"source":15, "target":3, "value":31},
{"source":15, "target":9, "value":135},
{"source":15, "target":20, "value":24},
{"source":15, "target":17, "value":17},
{"source":15, "target":13, "value":78},
{"source":15, "target":26, "value":2076},
{"source":15, "target":22, "value":55},
{"source":15, "target":18, "value":500},
{"source":15, "target":2, "value":45},
{"source":15, "target":10, "value":27},
{"source":15, "target":12, "value":14},
{"source":15, "target":24, "value":2804},
{"source":15, "target":11, "value":174},
{"source":15, "target":23, "value":58},
{"source":15, "target":5, "value":410},
{"source":15, "target":7, "value":6},
{"source":15, "target":21, "value":504},
{"source":15, "target":14, "value":6},
{"source":15, "target":1, "value":42},
{"source":15, "target":29, "value":718},
{"source":24, "target":1, "value":42},
{"source":24, "target":21, "value":832},
{"source":24, "target":17, "value":18},
{"source":24, "target":2, "value":53},
{"source":24, "target":9, "value":67},
{"source":24, "target":27, "value":26},
{"source":24, "target":22, "value":94},
{"source":24, "target":12, "value":21},
{"source":24, "target":25, "value":41},
{"source":24, "target":29, "value":1674},
{"source":24, "target":11, "value":317},
{"source":24, "target":13, "value":62},
{"source":24, "target":10, "value":24},
{"source":24, "target":15, "value":600},
{"source":24, "target":18, "value":414},
{"source":24, "target":4, "value":148},
{"source":24, "target":3, "value":38},
{"source":24, "target":26, "value":1831},
{"source":24, "target":8, "value":5},
{"source":24, "target":23, "value":82},
{"source":29, "target":24, "value":242},
{"source":29, "target":18, "value":376},
{"source":29, "target":23, "value":114},
{"source":29, "target":26, "value":1786},
{"source":29, "target":2, "value":78},
{"source":29, "target":14, "value":2},
{"source":29, "target":1, "value":11},
{"source":29, "target":25, "value":81},
{"source":29, "target":6, "value":8},
{"source":29, "target":4, "value":190},
{"source":29, "target":21, "value":2269},
{"source":29, "target":11, "value":535},
{"source":29, "target":15, "value":158},
{"source":29, "target":17, "value":21},
{"source":29, "target":13, "value":12},
{"source":29, "target":22, "value":178},
{"source":29, "target":20, "value":33},
{"source":29, "target":12, "value":27},
{"source":21, "target":26, "value":2441},
{"source":21, "target":25, "value":143},
{"source":21, "target":18, "value":521},
{"source":21, "target":9, "value":23},
{"source":21, "target":12, "value":64},
{"source":21, "target":20, "value":76},
{"source":21, "target":23, "value":271},
{"source":21, "target":24, "value":185},
{"source":21, "target":22, "value":462},
{"source":21, "target":2, "value":134},
{"source":21, "target":17, "value":38},
{"source":21, "target":6, "value":28},
{"source":21, "target":29, "value":446},
{"source":21, "target":11, "value":2383},
{"source":21, "target":15, "value":118},
{"source":21, "target":14, "value":6},
{"source":21, "target":4, "value":509},
{"source":21, "target":5, "value":21},
{"source":21, "target":8, "value":9},
{"source":11, "target":28, "value":43},
{"source":11, "target":26, "value":1943},
{"source":11, "target":3, "value":14},
{"source":11, "target":18, "value":397},
{"source":11, "target":20, "value":51},
{"source":11, "target":12, "value":55},
{"source":11, "target":21, "value":547},
{"source":11, "target":14, "value":6},
{"source":11, "target":2, "value":156},
{"source":11, "target":23, "value":330},
{"source":11, "target":6, "value":9},
{"source":11, "target":27, "value":8},
{"source":11, "target":22, "value":1392},
{"source":11, "target":25, "value":172},
{"source":11, "target":29, "value":182},
{"source":11, "target":19, "value":5},
{"source":11, "target":1, "value":13},
{"source":11, "target":4, "value":915},
{"source":22, "target":11, "value":353},
{"source":22, "target":23, "value":259},
{"source":22, "target":20, "value":29},
{"source":22, "target":2, "value":120},
{"source":22, "target":24, "value":16},
{"source":22, "target":18, "value":229},
{"source":22, "target":8, "value":9},
{"source":22, "target":17, "value":26},
{"source":22, "target":21, "value":150},
{"source":22, "target":4, "value":1125},
{"source":22, "target":26, "value":1217},
{"source":22, "target":25, "value":146},
{"source":22, "target":12, "value":26},
{"source":4, "target":11, "value":252},
{"source":4, "target":17, "value":62},
{"source":4, "target":2, "value":261},
{"source":4, "target":23, "value":1332},
{"source":4, "target":24, "value":46},
{"source":4, "target":6, "value":20},
{"source":4, "target":28, "value":94},
{"source":4, "target":21, "value":139},
{"source":4, "target":15, "value":57},
{"source":4, "target":13, "value":15},
{"source":4, "target":25, "value":441},
{"source":4, "target":26, "value":1700},
{"source":4, "target":12, "value":80},
{"source":4, "target":18, "value":287},
{"source":4, "target":20, "value":90},
{"source":23, "target":2, "value":380},
{"source":23, "target":22, "value":88},
{"source":23, "target":20, "value":110},
{"source":23, "target":18, "value":288},
{"source":23, "target":17, "value":82},
{"source":23, "target":5, "value":15},
{"source":23, "target":26, "value":1394},
{"source":23, "target":6, "value":34},
{"source":23, "target":21, "value":90},
{"source":23, "target":11, "value":108},
{"source":23, "target":12, "value":118},
{"source":23, "target":28, "value":23},
{"source":23, "target":4, "value":367},
{"source":23, "target":25, "value":824},
{"source":23, "target":15, "value":55},
{"source":25, "target":23, "value":162},
{"source":25, "target":8, "value":24},
{"source":25, "target":12, "value":307},
{"source":25, "target":16, "value":3},
{"source":25, "target":2, "value":1846},
{"source":25, "target":18, "value":291},
{"source":25, "target":26, "value":1254},
{"source":25, "target":6, "value":47},
{"source":25, "target":20, "value":248},
{"source":25, "target":17, "value":142},
{"source":25, "target":15, "value":12},
{"source":2, "target":20, "value":649},
{"source":2, "target":9, "value":7},
{"source":2, "target":26, "value":1372},
{"source":2, "target":14, "value":50},
{"source":2, "target":21, "value":30},
{"source":2, "target":12, "value":1573},
{"source":2, "target":7, "value":40},
{"source":2, "target":15, "value":17},
{"source":2, "target":18, "value":266},
{"source":2, "target":17, "value":209},
{"source":2, "target":11, "value":18},
{"source":2, "target":8, "value":52},
{"source":2, "target":29, "value":19},
{"source":2, "target":25, "value":388},
{"source":2, "target":6, "value":148},
{"source":12, "target":18, "value":192},
{"source":12, "target":2, "value":318},
{"source":12, "target":7, "value":54},
{"source":12, "target":16, "value":4},
{"source":12, "target":6, "value":170},
{"source":12, "target":17, "value":256},
{"source":12, "target":22, "value":4},
{"source":12, "target":20, "value":991},
{"source":12, "target":25, "value":150},
{"source":12, "target":26, "value":1029},
{"source":12, "target":14, "value":68},
{"source":20, "target":6, "value":382},
{"source":20, "target":17, "value":1084},
{"source":20, "target":2, "value":130},
{"source":20, "target":12, "value":175},
{"source":20, "target":26, "value":1062},
{"source":20, "target":27, "value":3},
{"source":20, "target":14, "value":51},
{"source":20, "target":8, "value":75},
{"source":20, "target":18, "value":186},
{"source":20, "target":4, "value":40},
{"source":17, "target":18, "value":170},
{"source":17, "target":4, "value":27},
{"source":17, "target":26, "value":942},
{"source":17, "target":20, "value":258},
{"source":17, "target":6, "value":828},
{"source":17, "target":14, "value":100},
{"source":17, "target":21, "value":16},
{"source":17, "target":27, "value":8},
{"source":6, "target":26, "value":705},
{"source":6, "target":2, "value":35},
{"source":6, "target":13, "value":4},
{"source":6, "target":11, "value":8},
{"source":6, "target":7, "value":480},
{"source":6, "target":14, "value":206},
{"source":6, "target":17, "value":178},
{"source":7, "target":17, "value":42},
{"source":7, "target":6, "value":80},
{"source":7, "target":8, "value":135},
{"source":7, "target":14, "value":461},
{"source":14, "target":3, "value":4},
{"source":14, "target":8, "value":493},
{"source":14, "target":26, "value":393},
{"source":14, "target":12, "value":23},
{"source":8, "target":7, "value":53},
{"source":8, "target":5, "value":3},
{"source":8, "target":21, "value":15},
{"source":8, "target":2, "value":37},
{"source":28, "target":26, "value":102},
{"source":28, "target":2, "value":10},
{"source":18, "target":16, "value":14},
{"source":18, "target":30, "value":3},
{"source":26, "target":28, "value":107},
{"source":1, "target":22, "value":10},
{"source":1, "target":28, "value":4},
{"source":1, "target":12, "value":5},
{"source":3, "target":28, "value":10},
{"source":3, "target":23, "value":20},
{"source":3, "target":17, "value":6},
{"source":10, "target":11, "value":16},
{"source":10, "target":4, "value":10},
{"source":13, "target":23, "value":14},
{"source":9, "target":25, "value":15},
{"source":9, "target":14, "value":3},
{"source":9, "target":27, "value":50},
{"source":19, "target":20, "value":4},
{"source":19, "target":1, "value":53},
{"source":19, "target":25, "value":15},
{"source":19, "target":12, "value":6},
{"source":5, "target":12, "value":7},
{"source":5, "target":3, "value":78},
{"source":5, "target":27, "value":60},
{"source":15, "target":28, "value":10},
{"source":24, "target":5, "value":186},
{"source":24, "target":19, "value":63},
{"source":24, "target":20, "value":9},
{"source":24, "target":28, "value":7},
{"source":29, "target":3, "value":24},
{"source":29, "target":27, "value":26},
{"source":29, "target":19, "value":9},
{"source":29, "target":8, "value":3},
{"source":29, "target":5, "value":41},
{"source":21, "target":16, "value":4},
{"source":21, "target":1, "value":15},
{"source":21, "target":28, "value":11},
{"source":11, "target":17, "value":37},
{"source":11, "target":24, "value":104},
{"source":11, "target":7, "value":6},
{"source":22, "target":28, "value":9},
{"source":22, "target":29, "value":40},
{"source":4, "target":22, "value":206},
{"source":4, "target":29, "value":61},
{"source":23, "target":27, "value":12},
{"source":23, "target":24, "value":36},
{"source":25, "target":24, "value":10},
{"source":25, "target":21, "value":25},
{"source":25, "target":4, "value":89},
{"source":25, "target":7, "value":13},
{"source":2, "target":27, "value":10},
{"source":2, "target":23, "value":75},
{"source":12, "target":8, "value":42},
{"source":12, "target":21, "value":24},
{"source":12, "target":1, "value":3},
{"source":12, "target":29, "value":18},
{"source":12, "target":23, "value":48},
{"source":12, "target":11, "value":10},
{"source":20, "target":16, "value":5},
{"source":20, "target":25, "value":107},
{"source":20, "target":29, "value":22},
{"source":20, "target":15, "value":12},
{"source":20, "target":21, "value":27},
{"source":20, "target":7, "value":111},
{"source":20, "target":5, "value":4},
{"source":20, "target":23, "value":50},
{"source":17, "target":8, "value":106},
{"source":17, "target":7, "value":148},
{"source":17, "target":12, "value":67},
{"source":6, "target":23, "value":20},
{"source":6, "target":29, "value":25},
{"source":6, "target":18, "value":129},
{"source":6, "target":5, "value":1},
{"source":6, "target":8, "value":165},
{"source":6, "target":25, "value":24},
{"source":6, "target":15, "value":2},
{"source":7, "target":22, "value":2},
{"source":7, "target":21, "value":9},
{"source":14, "target":11, "value":5},
{"source":14, "target":2, "value":27},
{"source":14, "target":15, "value":2},
{"source":14, "target":16, "value":9},
{"source":8, "target":17, "value":59},
{"source":8, "target":4, "value":16},
{"source":8, "target":16, "value":32},
{"source":8, "target":25, "value":38},
{"source":8, "target":18, "value":84},
{"source":8, "target":15, "value":8},
{"source":16, "target":8, "value":23},
{"source":28, "target":11, "value":21},
{"source":28, "target":23, "value":48},
{"source":28, "target":20, "value":3},
{"source":10, "target":1, "value":122},
{"source":9, "target":6, "value":6},
{"source":5, "target":22, "value":17},
{"source":24, "target":14, "value":3},
{"source":24, "target":6, "value":8},
{"source":29, "target":30, "value":1},
{"source":21, "target":27, "value":14},
{"source":21, "target":13, "value":29},
{"source":21, "target":7, "value":4},
{"source":11, "target":16, "value":28},
{"source":11, "target":15, "value":66},
{"source":22, "target":14, "value":4},
{"source":22, "target":1, "value":11},
{"source":22, "target":7, "value":5},
{"source":4, "target":8, "value":11},
{"source":4, "target":7, "value":10},
{"source":23, "target":13, "value":10},
{"source":25, "target":27, "value":11},
{"source":25, "target":29, "value":18},
{"source":2, "target":22, "value":8},
{"source":2, "target":24, "value":10},
{"source":17, "target":25, "value":42},
{"source":17, "target":28, "value":1},
{"source":6, "target":20, "value":127},
{"source":7, "target":26, "value":419},
{"source":14, "target":25, "value":10},
{"source":14, "target":18, "value":67},
{"source":8, "target":11, "value":7},
{"source":8, "target":23, "value":19},
{"source":8, "target":26, "value":420},
{"source":8, "target":14, "value":99},
{"source":8, "target":20, "value":44},
{"source":16, "target":12, "value":1},
{"source":16, "target":28, "value":1},
{"source":16, "target":15, "value":3},
{"source":30, "target":26, "value":31},
{"source":28, "target":12, "value":3},
{"source":28, "target":4, "value":67},
{"source":26, "target":30, "value":28},
{"source":27, "target":30, "value":5},
{"source":10, "target":12, "value":3},
{"source":9, "target":12, "value":3},
{"source":9, "target":28, "value":3},
{"source":19, "target":22, "value":6},
{"source":21, "target":3, "value":17},
{"source":11, "target":13, "value":18},
{"source":11, "target":8, "value":6},
{"source":11, "target":5, "value":7},
{"source":22, "target":6, "value":5},
{"source":22, "target":15, "value":32},
{"source":4, "target":27, "value":8},
{"source":4, "target":1, "value":9},
{"source":23, "target":29, "value":47},
{"source":23, "target":14, "value":15},
{"source":25, "target":1, "value":7},
{"source":25, "target":10, "value":2},
{"source":25, "target":22, "value":28},
{"source":2, "target":4, "value":66},
{"source":20, "target":22, "value":8},
{"source":20, "target":9, "value":4},
{"source":17, "target":2, "value":48},
{"source":6, "target":12, "value":36},
{"source":6, "target":21, "value":14},
{"source":6, "target":4, "value":12},
{"source":6, "target":22, "value":5},
{"source":7, "target":20, "value":36},
{"source":14, "target":6, "value":55},
{"source":14, "target":5, "value":1},
{"source":14, "target":27, "value":3},
{"source":8, "target":12, "value":36},
{"source":16, "target":26, "value":98},
{"source":30, "target":29, "value":1},
{"source":28, "target":27, "value":1},
{"source":28, "target":18, "value":10},
{"source":18, "target":31, "value":2},
{"source":27, "target":28, "value":3},
{"source":3, "target":8, "value":3},
{"source":19, "target":6, "value":1},
{"source":5, "target":10, "value":28},
{"source":24, "target":7, "value":2},
{"source":29, "target":28, "value":19},
{"source":22, "target":13, "value":12},
{"source":4, "target":9, "value":14},
{"source":23, "target":8, "value":18},
{"source":23, "target":7, "value":15},
{"source":23, "target":10, "value":7},
{"source":25, "target":14, "value":18},
{"source":12, "target":10, "value":2},
{"source":12, "target":3, "value":2},
{"source":12, "target":15, "value":2},
{"source":12, "target":5, "value":5},
{"source":20, "target":13, "value":4},
{"source":20, "target":11, "value":14},
{"source":17, "target":23, "value":27},
{"source":7, "target":1, "value":1},
{"source":14, "target":17, "value":49},
{"source":14, "target":20, "value":25},
{"source":14, "target":29, "value":2},
{"source":26, "target":31, "value":34},
{"source":27, "target":8, "value":2},
{"source":1, "target":7, "value":4},
{"source":15, "target":6, "value":6},
{"source":29, "target":9, "value":9},
{"source":21, "target":10, "value":5},
{"source":22, "target":16, "value":3},
{"source":23, "target":9, "value":9},
{"source":2, "target":3, "value":15},
{"source":6, "target":16, "value":4},
{"source":7, "target":16, "value":1},
{"source":8, "target":27, "value":2},
{"source":16, "target":11, "value":28},
{"source":30, "target":18, "value":3},
{"source":28, "target":29, "value":7},
{"source":31, "target":18, "value":3},
{"source":3, "target":7, "value":3},
{"source":25, "target":13, "value":8},
{"source":2, "target":1, "value":5},
{"source":12, "target":4, "value":32},
{"source":12, "target":24, "value":8},
{"source":17, "target":24, "value":4},
{"source":14, "target":1, "value":1},
{"source":8, "target":6, "value":68},
{"source":28, "target":21, "value":4},
{"source":31, "target":26, "value":31},
{"source":10, "target":30, "value":2},
{"source":11, "target":9, "value":9},
{"source":22, "target":19, "value":1},
{"source":4, "target":3, "value":12},
{"source":25, "target":5, "value":5},
{"source":8, "target":24, "value":2},
{"source":16, "target":30, "value":11},
{"source":16, "target":22, "value":6},
{"source":28, "target":1, "value":3},
{"source":28, "target":24, "value":2},
{"source":31, "target":25, "value":1},
{"source":11, "target":10, "value":7},
{"source":25, "target":3, "value":5},
{"source":25, "target":11, "value":24},
{"source":20, "target":3, "value":6},
{"source":6, "target":24, "value":5},
{"source":7, "target":12, "value":11},
{"source":14, "target":24, "value":3},
{"source":14, "target":7, "value":59},
{"source":14, "target":23, "value":9},
{"source":8, "target":3, "value":2},
{"source":30, "target":10, "value":2},
{"source":27, "target":16, "value":2},
{"source":27, "target":6, "value":3},
{"source":19, "target":17, "value":6},
{"source":22, "target":5, "value":6},
{"source":4, "target":19, "value":9},
{"source":12, "target":27, "value":3},
{"source":17, "target":13, "value":3},
{"source":17, "target":29, "value":5},
{"source":17, "target":22, "value":14},
{"source":7, "target":4, "value":4},
{"source":16, "target":4, "value":3},
{"source":29, "target":10, "value":7},
{"source":4, "target":31, "value":1},
{"source":28, "target":25, "value":8},
{"source":21, "target":19, "value":8},
{"source":22, "target":3, "value":7},
{"source":2, "target":13, "value":4},
{"source":17, "target":16, "value":1},
{"source":16, "target":1, "value":2},
{"source":30, "target":1, "value":2},
{"source":28, "target":3, "value":5},
{"source":12, "target":9, "value":2},
{"source":7, "target":18, "value":80},
{"source":7, "target":29, "value":3},
{"source":28, "target":7, "value":2},
{"source":10, "target":8, "value":1},
{"source":22, "target":27, "value":5},
{"source":23, "target":3, "value":9},
{"source":14, "target":21, "value":7},
{"source":14, "target":22, "value":5},
{"source":16, "target":18, "value":11},
{"source":16, "target":27, "value":1},
{"source":28, "target":16, "value":3},
{"source":8, "target":10, "value":1},
{"source":16, "target":17, "value":2},
{"source":16, "target":6, "value":2},
{"source":28, "target":17, "value":3},
{"source":9, "target":8, "value":1},
{"source":4, "target":14, "value":10},
{"source":25, "target":9, "value":5},
{"source":29, "target":7, "value":2},
{"source":17, "target":11, "value":10},
{"source":17, "target":9, "value":1},
{"source":8, "target":29, "value":8},
{"source":27, "target":7, "value":2},
{"source":20, "target":24, "value":10},
{"source":7, "target":25, "value":9},
{"source":8, "target":9, "value":2},
{"source":11, "target":30, "value":1},
{"source":14, "target":4, "value":4},
{"source":5, "target":31, "value":1},
{"source":23, "target":1, "value":8},
{"source":25, "target":19, "value":4},
{"source":23, "target":19, "value":11},
{"source":16, "target":20, "value":2},
{"source":30, "target":11, "value":1},
{"source":31, "target":5, "value":1},
{"source":24, "target":16, "value":2},
{"source":25, "target":31, "value":1},
{"source":7, "target":2, "value":12},
{"source":16, "target":10, "value":1},
{"source":30, "target":16, "value":6},
{"source":7, "target":27, "value":1},
{"source":31, "target":30, "value":1},
{"source":5, "target":6, "value":3},
{"source":8, "target":19, "value":2},
{"source":17, "target":10, "value":3},
{"source":6, "target":19, "value":1},
{"source":10, "target":17, "value":1},
{"source":16, "target":23, "value":3},
{"source":17, "target":15, "value":13},
{"source":1, "target":30, "value":2},
{"source":7, "target":23, "value":11},
{"source":30, "target":3, "value":6},
{"source":3, "target":31, "value":1},
{"source":2, "target":28, "value":1},
{"source":1, "target":14, "value":2},
{"source":12, "target":13, "value":2},
{"source":16, "target":3, "value":2},
{"source":31, "target":3, "value":3},
{"source":16, "target":31, "value":2},
{"source":28, "target":5, "value":2},
{"source":4, "target":10, "value":4},
{"source":28, "target":15, "value":2},
{"source":3, "target":14, "value":5},
{"source":9, "target":30, "value":3},
{"source":24, "target":31, "value":1},
{"source":11, "target":31, "value":1},
{"source":10, "target":2, "value":5},
{"source":20, "target":30, "value":1},
{"source":30, "target":9, "value":3},
{"source":31, "target":28, "value":3},
{"source":3, "target":30, "value":3},
{"source":30, "target":20, "value":1},
{"source":3, "target":16, "value":2},
{"source":7, "target":11, "value":3},
{"source":16, "target":29, "value":1},
{"source":25, "target":30, "value":1},
{"source":30, "target":23, "value":2},
{"source":28, "target":9, "value":3},
{"source":7, "target":15, "value":3},
{"source":22, "target":9, "value":4},
{"source":29, "target":16, "value":1},
{"source":4, "target":5, "value":3},
{"source":28, "target":14, "value":2},
{"source":22, "target":10, "value":2},
{"source":30, "target":27, "value":1},
{"source":19, "target":28, "value":1},
{"source":31, "target":23, "value":2},
{"source":13, "target":8, "value":1},
{"source":6, "target":3, "value":1},
{"source":15, "target":30, "value":1},
{"source":23, "target":16, "value":1},
{"source":31, "target":10, "value":1},
{"source":30, "target":5, "value":1},
{"source":30, "target":31, "value":2},
{"source":16, "target":25, "value":1},
{"source":4, "target":30, "value":1},
{"source":10, "target":6, "value":2},
{"source":1, "target":16, "value":1},
{"source":12, "target":19, "value":2},
{"source":17, "target":19, "value":1},
{"source":30, "target":12, "value":1},
{"source":27, "target":31, "value":1},
{"source":13, "target":16, "value":2},
{"source":19, "target":14, "value":1},
{"source":20, "target":19, "value":1},
{"source":6, "target":31, "value":1},
{"source":1, "target":8, "value":1},
{"source":31, "target":6, "value":1},
{"source":23, "target":31, "value":1},
{"source":30, "target":13, "value":1},
{"source":30, "target":28, "value":1},
{"source":28, "target":31, "value":2},
{"source":31, "target":21, "value":1},
{"source":13, "target":30, "value":1},
{"source":23, "target":30, "value":2},
{"source":30, "target":24, "value":1},
{"source":10, "target":20, "value":1},
{"source":7, "target":9, "value":1},
{"source":16, "target":21, "value":1},
{"source":17, "target":5, "value":2},
{"source":6, "target":10, "value":2},
{"source":8, "target":22, "value":1},
{"source":19, "target":8, "value":1},
{"source":1, "target":31, "value":1},
{"source":28, "target":10, "value":1},
{"source":14, "target":13, "value":3},
{"source":13, "target":14, "value":1},
{"source":8, "target":28, "value":4},
{"source":2, "target":19, "value":1},
{"source":31, "target":22, "value":1},
{"source":31, "target":16, "value":1},
{"source":3, "target":6, "value":1},
{"source":7, "target":28, "value":1},
{"source":2, "target":5, "value":1},
{"source":7, "target":10, "value":1},
{"source":10, "target":7, "value":1},
{"source":2, "target":10, "value":1},
{"source":31, "target":8, "value":1},
{"source":28, "target":8, "value":4}
]

biHiSankey
  .nodes(exampleNodes)
  .links(exampleLinks)
  .initializeNodes(function (node) {
    node.state = node.parent ? "contained" : "collapsed";
  })
  .layout(LAYOUT_INTERATIONS);

disableUserInterractions(2 * TRANSITION_DURATION);

update();