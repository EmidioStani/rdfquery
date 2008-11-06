/*
 * jQuery RDF @VERSION
 * 
 * Copyright (c) 2008 Jeni Tennison
 * Licensed under the MIT (MIT-LICENSE.txt)
 *
 * Depends:
 *  jquery.uri.js
 *  jquery.xmlns.js
 *  jquery.datatype.js
 *  jquery.curie.js
 */
/*global jQuery */
(function ($) {

  var 
    memResource = {},
    memBlank = {},
    memLiteral = {},
    memTriple = {},
    xsdNs = "http://www.w3.org/2001/XMLSchema#",
    rdfNs = "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    uriRegex = /^<(([^>]|\\>)*)>$/,
    literalRegex = /^("""((\\"|[^"])*)"""|"((\\"|[^"])*)")(@([a-z]+(-[a-z0-9]+)*)|\^\^(.+))?$/,
    tripleRegex = /(("""((\\"|[^"])*)""")|("(\\"|[^"]|)*")|(<(\\>|[^>])*>)|\S)+/g,
    
    blankNodeSeed = new Date().getTime() % 1000,
    blankNodeID = function () {
      blankNodeSeed += 1;
      return 'b' + blankNodeSeed.toString(16);
    },
    
    subject = function (subject, opts) {
      if (typeof subject === 'string') {
        try {
          return $.rdf.resource(subject, opts);
        } catch (e) {
          try {
            return $.rdf.blank(subject, opts);
          } catch (f) {
            throw "Bad Triple: Subject " + subject + " is not a resource: " + f;
          }
        }
      } else {
        return subject;
      }
    },
    
    property = function (property, opts) {
      if (property === 'a') {
        return $.rdf.type;
      } else if (typeof property === 'string') {
        try {
          return $.rdf.resource(property, opts);
        } catch (e) {
          throw "Bad Triple: Property " + property + " is not a resource: " + e;
        }
      } else {
        return property;
      }
    },
    
    object = function (object, opts) {
      if (typeof object === 'string') {
        try {
          return $.rdf.resource(object, opts);
        } catch (e) {
          try {
            return $.rdf.blank(object, opts);
          } catch (f) {
            try {
              return $.rdf.literal(object, opts);
            } catch (g) {
              throw "Bad Triple: Object " + object + " is not a resource or a literal " + g;
            }
          }
        }
      } else {
        return object;
      }
    },
    
    parseFilter = function (filter, options) {
      var
         s, p, o,
         optional = options.optional || false,
        m = filter.match(tripleRegex);
      if (m.length === 3 || (m.length === 4) && m[3] === '.') {
        s = m[0];
        p = m[1];
        o = m[2];
        s = s.substring(0, 1) === '?' ? s.substring(1) : subject(s, options);
        p = p.substring(0, 1) === '?' ? p.substring(1) : property(p, options);
        o = o.substring(0, 1) === '?' ? o.substring(1) : object(o, options);
        return { subject: s, property: p, object: o, optional: optional };
      } else {
        throw "Malformed Filter: The filter " + filter + " is not legal";
      }
    },
    
    fillFilter = function (filter, bindings) {
      var f = $.extend({}, filter);
      if (typeof f.subject === 'string' &&
          bindings[f.subject]) {
        f.subject = bindings[f.subject];
      }
      if (typeof f.property === 'string' &&
          bindings[f.property]) {
        f.property = bindings[f.property];
      }
      if (typeof f.object === 'string' &&
          bindings[f.object]) {
        f.object = bindings[f.object];
      }
      return f;
    },
    
    testResource = function (resource, filter, existing) {
      if (typeof filter === 'string') {
        if (existing[filter] && existing[filter] !== resource) {
          return null;
        } else {
          existing[filter] = resource;
          return existing;
        }
      } else if (filter === resource) {
        return existing;
      } else {
        return null;
      }
    },
    
    testTriple = function (triple, filter) {
      var binding = {};
      binding = testResource(triple.subject, filter.subject, binding);
      if (binding === null) {
        return null;
      }
      binding = testResource(triple.property, filter.property, binding);
      if (binding === null) {
        return null;
      }
      binding = testResource(triple.object, filter.object, binding);
      return binding;
    },
    
    findMatches = function (triples, filter) {
      return $.map(triples, function (triple) {
        var bindings = testTriple(triple, filter);
        return bindings === null ? null : { bindings: bindings, triples: [triple] };
      });
    },
    
    mergeMatches = function (existingMs, newMs, optional) {
      return $.map(existingMs, function (existingM) {
        var compatibleMs = $.map(newMs, function (newM) {
          // For newM to be compatible with existingM, all the bindings
          // in newM must either be the same as in existingM, or not
          // exist in existingM
          var isCompatible = true;
          $.each(newM.bindings, function (k, b) {
            if (!(existingM.bindings[k] === undefined ||
                  existingM.bindings[k] === b)) {
              isCompatible = false;
              return false;
            }
          });
          return isCompatible ? newM : null;
        });
        if (compatibleMs.length > 0) {
          return $.map(compatibleMs, function (compatibleM) {
            return {
              bindings: $.extend({}, existingM.bindings, compatibleM.bindings), 
              triples: $.unique(existingM.triples.concat(compatibleM.triples))
            };
          });
        } else {
          return optional ? existingM : null;
        }
      });
    },
    
    registerQuery = function (databank, query) {
      var s, p, o;
      if (query.filterExp !== undefined && !$.isFunction(query.filterExp)) {
        if (databank.union === undefined) {
          s = typeof query.filterExp.subject === 'string' ? '' : query.filterExp.subject;
          p = typeof query.filterExp.property === 'string' ? '' : query.filterExp.property;
          o = typeof query.filterExp.object === 'string' ? '' : query.filterExp.object;
          if (databank.queries[s] === undefined) {
            databank.queries[s] = {};
          }
          if (databank.queries[s][p] === undefined) {
            databank.queries[s][p] = {};
          }
          if (databank.queries[s][p][o] === undefined) {
            databank.queries[s][p][o] = [];
          }
          databank.queries[s][p][o].push(query);
        } else {
          $.each(databank.union, function (i, databank) {
            registerQuery(databank, query);
          });
        }
      }
    },
    
    addToDatabankQueries = function (databank, triple) {
      var s = triple.subject,
        p = triple.property,
        o = triple.object;
      if (databank.union === undefined) {
        if (databank.queries[s] !== undefined) {
          if (databank.queries[s][p] !== undefined) {
            if (databank.queries[s][p][o] !== undefined) {
              addToQueries(databank.queries[s][p][o], triple);
            }
            if (databank.queries[s][p][''] !== undefined) {
              addToQueries(databank.queries[s][p][''], triple);
            }
          }
          if (databank.queries[s][''] !== undefined) {
            if (databank.queries[s][''][o] !== undefined) {
              addToQueries(databank.queries[s][''][o], triple);
            }
            if (databank.queries[s][''][''] !== undefined) {
              addToQueries(databank.queries[s][''][''], triple);
            }
          }
        }
        if (databank.queries[''] !== undefined) {
          if (databank.queries[''][p] !== undefined) {
            if (databank.queries[''][p][o] !== undefined) {
              addToQueries(databank.queries[''][p][o], triple);
            }
            if (databank.queries[''][p][''] !== undefined) {
              addToQueries(databank.queries[''][p][''], triple);
            }
          }
          if (databank.queries[''][''] !== undefined) {
            if (databank.queries[''][''][o] !== undefined) {
              addToQueries(databank.queries[''][''][o], triple);
            }
            if (databank.queries[''][''][''] !== undefined) {
              addToQueries(databank.queries[''][''][''], triple);
            }
          }
        }
      } else {
        $.each(databank.union, function (i, databank) {
          addToDatabankQueries(databank, triple);
        });
      }
    },
    
    addToQueries = function (queries, triple) {
      $.each(queries, function (i, query) {
        addToQuery(query, triple);
      });
    },
    
    addToQuery = function (query, triple) {
      var match, 
        bindings = testTriple(triple, query.filterExp);
      if (bindings !== null) {
        match = { triples: [triple], bindings: bindings };
        query.alphaMemory.push(match);
        rightActivate(query, match);
      }
    },
    
    rightActivate = function (query, match) {
      var newMatches;
      if (query.filterExp.optional) {
        resetQuery(query);
        leftActivate(query);
      } else {
        if (query.top || query.parent.top) {
          newMatches = [match];
        } else {
          newMatches = mergeMatches(query.parent, [match], false);
        }
        updateQuery(query, newMatches);
      }
    },
    
    leftActivate = function (query, matches) {
      var newMatches;
      if (query.union === undefined) {
        matches = matches || query.parent;
        if (query.top || query.parent.top) {
          newMatches = query.alphaMemory;
        } else if ($.isFunction(query.filterExp)) {
          newMatches = $.map(matches, function (match) {
            return query.filterExp(match.bindings) ? match : null;
          });
        } else {
          newMatches = mergeMatches(matches, query.alphaMemory, query.filterExp.optional);
        }        
      } else {
        newMatches = $.map(query.union, function (q) {
          return q.get();
        });
      }
      updateQuery(query, newMatches);
    },
    
    updateQuery = function (query, matches) {
      if (matches.length > 0) {
        $.each(query.children, function (i, child) {
          leftActivate(child, matches);
        });
        $.each(query.partOf, function (i, union) {
          updateQuery(union, matches);
        });
        Array.prototype.push.apply(query, matches);
      }
    },
    
    resetQuery = function (query) {
      query.length = 0;
      $.each(query.children, function (i, child) {
        resetQuery(child);
      });
      $.each(query.partOf, function (i, union) {
        resetQuery(union);
      });
    };
    
  $.typedValue.types['http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral'] = {
    regex: /^.*$/,
    strip: false,
    value: function (v) {
      return v;
    }
  };

  // Trying to follow jQuery's general pattern, to get the same effect
  $.rdf = function (options) {
    return new $.rdf.fn.init(options);
  };

  $.rdf.fn = $.rdf.prototype = {
    rdfquery: '0.2',
    
    init: function (options) {
      var base, namespaces, optional, databanks, query = this;
      options = options || {};
      /* must specify either a parent or a union, otherwise it's the top */
      this.parent = options.parent;
      this.union = options.union;
      if (this.parent === undefined && this.union === undefined) {
        this.top = true;
      } else {
        this.top = false;
      }
      if (this.union === undefined) {
        if (options.databank === undefined) {
          this.databank = this.parent === undefined ? $.rdf.databank(options.triples, options) : this.parent.databank;
        } else {
          this.databank = options.databank;
        }
      } else {
        databanks = $.map(this.union, function (query) {
          return query.databank;
        });
        databanks = $.unique(databanks);
        if (databanks[1] !== undefined) {
          this.databank = $.rdf.databank(undefined, { union: databanks });
        } else {
          this.databank = databanks[0];
        }
      }
      this.children = [];
      this.partOf = [];
      this.filterExp = options.filter;
      this.alphaMemory = [];
      this.length = 0;
      if (this.filterExp !== undefined) {
        if (!$.isFunction(this.filterExp)) {
          registerQuery(this.databank, this);
          this.alphaMemory = findMatches(this.databank.triples(), this.filterExp);
        }
      }
      leftActivate(this);
      return this;
    },
    
    base: function (base) {
      if (base === undefined) {
        return this.databank.base();
      } else {
        this.databank.base(base);
        return this;
      }
    },
    
    prefix: function (prefix, namespace) {
      if (namespace === undefined) {
        return this.databank.prefix(prefix);
      } else {
        this.databank.prefix(prefix, namespace);
        return this;
      }
    },
    
    add: function (triple, options) {
      var query, databank;
      if (triple.rdfquery !== undefined) {
        if (triple.top) {
          databank = this.databank.add(triple.databank);
          query = $.rdf({ parent: this.parent, databank: databank });
          return query;
        } else if (this.top) {
          databank = triple.databank.add(this.databank);
          query = $.rdf({ parent: triple.parent, databank: databank })
          return query;
        } else if (this.union === undefined) {
          query = $.rdf({ union: [this, triple] });
          this.partOf.push(query);
          triple.partOf.push(query);
          return query;
        } else {
          this.union.push(triple);
          triple.partOf.push(this);
        }
      } else if (typeof triple === 'string') {
        options = $.extend({}, { base: this.base(), namespaces: this.prefix(), source: triple }, options);
        triple = parseFilter(triple, options);
        if (typeof triple.subject === 'string' ||
            typeof triple.property === 'string' ||
            typeof triple.object === 'string') {
          query = this;
          this.bindings().each(function (i, bindings) {
            var t = fillFilter(triple, bindings);
            if (typeof t.subject !== 'string' &&
                typeof t.property !== 'string' &&
                typeof t.object !== 'string') {
              query.databank.add($.rdf.triple(t.subject, t.property, t.object, options), options);
            }
          });
        } else {
          this.databank.add($.rdf.triple(triple.subject, triple.property, triple.object, options), options);
        }
      } else {
        this.databank.add(triple, options);
      }
      return this;
    },
    
    bindings: function () {
      return $($.map(this, function (match) {
        return match.bindings;
      }));
    },
    
    triples: function () {
      return $($.map(this, function (match) {
        return [match.triples]; // effectively returning an array of the array because otherwise arrays get flattened
      }));
    },
    
    where: function (filter, options) {
      var query;
      options = options || {};
      if (typeof filter === 'string') {
        base = options.base || this.base();
        namespaces = $.extend({}, this.prefix(), options.namespaces || {}),
        optional = options.optional || false;
        filter = parseFilter(filter, { namespaces: namespaces, base: base, optional: optional } );
      }
      query = $.rdf($.extend({}, options, { parent: this, filter: filter }));
      this.children.push(query);
      return query;
    },
    
    optional: function (filter, options) {
      return this.where(filter, $.extend({}, options || {}, { optional: true }));
    },
    
    filter: function (binding, condition) {
      var func, query;
      if (typeof binding === 'string') {
        if (condition.constructor === RegExp) {
          func = function (bindings) {
            return condition.test(bindings[binding].value);
          };
        } else {
          func = function (bindings) {
            return bindings[binding].literal ? bindings[binding].value === condition : bindings[binding] === condition;
          };
        }
      } else {
        func = binding;
      }
      query = $.rdf({ parent: this, filter: func });
      this.children.push(query);
      return query;
    },

    reset: function () {
      var query = this;
      while (query.parent !== undefined) {
        query = query.parent;
      }
      return query;
    },

    end: function () {
      return this.parent;
    },

    size: function () {
      return this.length;
    },
    
    get: function (num) {
      return (num === undefined) ? $.makeArray(this) : this[num];
    },
    
    each: function (callback, args) {
      $.each(this, callback, args);
      return this;
    },
    
    map: function (callback) {
      return $($.map(this, function (match, i) {
  			return callback.call( match, i, match ); // in the callback, this is the match, and the arguments are swapped
  		}));
    },
    
    jquery: function () {
      return $(this);
    }
  };

  $.rdf.fn.init.prototype = $.rdf.fn;

  $.rdf.gleaners = [];

  $.fn.rdf = function () {
    var i, j, match, triples = [];
    for (i = 0; i < $(this).length; i += 1) {
      match = $(this).eq(i);
      for (j = 0; j < $.rdf.gleaners.length; j += 1) {
        triples = triples.concat($.rdf.gleaners[j].call(match));
      }
    }
    return $.rdf(triples, { namespaces: $(this).xmlns() });
  };

/*
 * Triplestores aka Databanks
 */

  $.rdf.databank = function (triples, options) {
    return new $.rdf.databank.fn.init(triples, options);
  };

  $.rdf.databank.fn = $.rdf.databank.prototype = {
    init: function (triples, options) {
      var i;
      triples = triples || [];
      options = options || {};
      if (options.union === undefined) {
        this.queries = {};
        this.tripleStore = {};
        this.baseURI = options.base || $.uri.base();
        this.namespaces = $.extend({}, options.namespaces || {});
        for (i = 0; i < triples.length; i += 1) {
          this.add(triples[i]);
        }        
      } else {
        this.union = options.union;
      }
      return this;
    },
    
    base: function (base) {
      if (this.union === undefined) {
        if (base === undefined) {
          return this.baseURI;
        } else {
          this.baseURI = base;
          return this;
        }
      } else if (base === undefined) {
        return this.union[0].base();
      } else {
        $.each(this.union, function (i, databank) {
          databank.base(base);
        });
        return this;
      }
    },
  
    prefix: function (prefix, uri) {
      var namespaces = {};
      if (this.union === undefined) {
        if (prefix === undefined) {
          return this.namespaces;
        } else if (uri === undefined) {
          return this.namespaces[prefix];
        } else {
          this.namespaces[prefix] = uri;
          return this;
        }
      } else if (uri === undefined) {
        $.each(this.union, function (i, databank) {
          $.extend(namespaces, databank.prefix());
        });
        if (prefix === undefined) {
          return namespaces;
        } else {
          return namespaces[prefix];
        }
      } else {
        $.each(this.union, function (i, databank) {
          databank.prefix(prefix, namespace);
        });
        return this;
      }
    },

    add: function (triple, options) {
      var base = (options && options.base) || this.base(),
        namespaces = $.extend({}, this.prefix(), (options && options.namespaces) || {}),
        databank, triples, i;
      if (triple === this) {
        return this;
      } else if (triple.tripleStore !== undefined) {
        // merging two databanks
        if (this.union === undefined) {
          databank = $.rdf.databank(undefined, { union: [this, triple] });
          return databank;
        } else {
          this.union.push(triple);
          return this;
        }
      } else {
        if (typeof triple === 'string') {
          triple = $.rdf.triple(triple, { namespaces: namespaces, base: base, source: triple });
        }
        if (this.union === undefined) {
          if (this.tripleStore[triple.subject] === undefined) {
            this.tripleStore[triple.subject] = [];
          }
          if ($.inArray(triple, this.tripleStore[triple.subject]) === -1) {
            this.tripleStore[triple.subject].push(triple);
            addToDatabankQueries(this, triple);
          }
        } else {
          $.each(this.union, function (i, databank) {
            databank.add(triple);
          });
        }
        return this;
      }
    },
    
    triples: function () {
      var triples = [];
      if (this.union === undefined) {
        $.each(this.tripleStore, function (s, t) {
          triples = triples.concat(t);
        });
      } else {
        $.each(this.union, function (i, databank) {
          triples = triples.concat(databank.triples().get());
        });
        triples = $.unique(triples);
      }
      return $(triples);
    },
    
    size: function () {
      return this.triples().length;
    },
    
    toString: function () {
      return '[Databank with ' + this.size() + ' triples]';
    }
  }
  
  $.rdf.databank.fn.init.prototype = $.rdf.databank.fn;


/*
 * Triples
 */

  $.rdf.triple = function (subject, property, object, options) {
    var triple, m;
    // using a two-argument version; first argument is a Turtle statement string
    if (object === undefined) { 
      options = property;
      m = $.trim(subject).match(tripleRegex);
      if (m.length === 3 || (m.length === 4 && m[3] === '.')) {
        subject = m[0];
        property = m[1];
        object = m[2];
      } else {
        throw "Bad Triple: Couldn't parse string " + subject;
      }
    }
    if (memTriple[subject] && memTriple[subject][property] && memTriple[subject][property][object]) {
      return memTriple[subject][property][object];
    }
    triple = new $.rdf.triple.fn.init(subject, property, object, options);
    if (memTriple[triple.subject] && 
        memTriple[triple.subject][triple.property] && 
        memTriple[triple.subject][triple.property][triple.object]) {
      return memTriple[triple.subject][triple.property][triple.object];
    } else {
      if (memTriple[triple.subject] === undefined) {
        memTriple[triple.subject] = {};
      }
      if (memTriple[triple.subject][triple.property] === undefined) {
        memTriple[triple.subject][triple.property] = {};
      }
      memTriple[triple.subject][triple.property][triple.object] = triple;
      return triple;
    }
  };

  $.rdf.triple.fn = $.rdf.triple.prototype = {
    init: function (s, p, o, options) {
      var opts, m;
      opts = $.extend({}, $.rdf.triple.defaults, options);
      this.subject = subject(s, opts);
      this.property = property(p, opts);
      this.object = object(o, opts);
      this.source = opts.source;
      return this;
    },
    
    toString: function () {
      return this.subject + ' ' + this.property + ' ' + this.object + ' .';
    }
  };

  $.rdf.triple.fn.init.prototype = $.rdf.triple.fn;
  
  $.rdf.triple.defaults = {
    base: $.uri.base(),
    source: [document],
    namespaces: {}
  };

/*
 * Resources
 */ 

  $.rdf.resource = function (value, options) {
    var resource;
    if (memResource[value]) {
      return memResource[value];
    }
    resource = new $.rdf.resource.fn.init(value, options);
    if (memResource[resource]) {
      return memResource[resource];
    } else {
      memResource[resource] = resource;
      return resource;
    }
  };

  $.rdf.resource.fn = $.rdf.resource.prototype = {
    resource: true,
    literal: false,
    uri: undefined,
    blank: false,
    
    init: function (value, options) {
      var m, prefix, uri, opts;
      if (typeof value === 'string') {
        m = uriRegex.exec(value);
        opts = $.extend({}, $.rdf.resource.defaults, options);
        if (m !== null) {
          this.uri = $.uri.resolve(m[1].replace(/\\>/g, '>'), opts.base);
        } else if (value.substring(0, 1) === ':') {
          uri = opts.namespaces[''];
          if (uri === undefined) {
            throw "Malformed Resource: No namespace binding for default namespace in " + value;
          } else {
            this.uri = $.uri.resolve(uri + value.substring(1));
          }
        } else if (value.substring(value.length - 1) === ':') {
          prefix = value.substring(0, value.length - 1);
          uri = opts.namespaces[prefix];
          if (uri === undefined) {
            throw "Malformed Resource: No namespace binding for prefix " + prefix + " in " + value;
          } else {
            this.uri = $.uri.resolve(uri);
          }
        } else {
          try {
            this.uri = $.curie(value, { namespaces: opts.namespaces });
          } catch (e) {
            throw "Malformed Resource: Bad format for resource " + e;
          }
        }
      } else {
        this.uri = value;
      }
      return this;
    }, // end init
    
    toString: function () {
      return '<' + this.uri + '>';
    }
  };

  $.rdf.resource.fn.init.prototype = $.rdf.resource.fn;
  
  $.rdf.resource.defaults = {
    base: $.uri.base(),
    namespaces: {}
  };

  $.rdf.type = $.rdf.resource('<' + rdfNs + 'type>');
  $.rdf.label = $.rdf.resource('<' + rdfNs + 'label>');

  $.rdf.blank = function (value, options) {
    var blank;
    if (memBlank[value]) {
      return memBlank[value];
    }
    blank = new $.rdf.blank.fn.init(value, options);
    if (memBlank[blank]) {
      return memBlank[blank];
    } else {
      memBlank[blank] = blank;
      return blank;
    }
  };
  
  $.rdf.blank.fn = $.rdf.blank.prototype = {
    resource: true,
    literal: false,
    blank: true,
    id: undefined,
    
    init: function (value, options) {
      if (value === '[]') {
        this.id = blankNodeID();
      } else if (value.substring(0, 2) === '_:') {
        this.id = value.substring(2);
      } else {
        throw "Malformed Blank Node: " + value + " is not a legal format for a blank node";
      }
      return this;
    },
    
    toString: function () {
      return '_:' + this.id;
    }
  };

  $.rdf.blank.fn.init.prototype = $.rdf.blank.fn;

  $.rdf.literal = function (value, options) {
    var literal;
    if (memLiteral[value]) {
      return memLiteral[value];
    }
    literal = new $.rdf.literal.fn.init(value, options);
    if (memLiteral[literal]) {
      return memLiteral[literal];
    } else {
      memLiteral[literal] = literal;
      return literal;
    }
  };

  $.rdf.literal.fn = $.rdf.literal.prototype = {
    resource: false,
    literal: true,
    blank: false,
    value: undefined,
    lang: undefined,
    datatype: undefined,
    
    init: function (value, options) {
      var 
        m, datatype,
        opts = $.extend({}, $.rdf.literal.defaults, options);
      if (opts.lang !== undefined && opts.datatype !== undefined) {
        throw "Malformed Literal: Cannot define both a language and a datatype for a literal (" + value + ")";
      }
      if (opts.datatype !== undefined) {
        datatype = $.safeCurie(opts.datatype, { namespaces: opts.namespaces });
        $.extend(this, $.typedValue(value.toString(), datatype));
      } else if (opts.lang !== undefined) {
        this.value = value.toString();
        this.lang = opts.lang;
      } else if (typeof value === 'boolean') {
        $.extend(this, $.typedValue(value.toString(), xsdNs + 'boolean'));
      } else if (typeof value === 'number') {
        $.extend(this, $.typedValue(value.toString(), xsdNs + 'double'));
      } else if (value === 'true' || value === 'false') {
        $.extend(this, $.typedValue(value, xsdNs + 'boolean'));
      } else if ($.typedValue.valid(value, xsdNs + 'integer')) {
        $.extend(this, $.typedValue(value, xsdNs + 'integer'));
      } else if ($.typedValue.valid(value, xsdNs + 'decimal')) {
        $.extend(this, $.typedValue(value, xsdNs + 'decimal'));
      } else if ($.typedValue.valid(value, xsdNs + 'double') &&
                 !/^\s*([\-\+]?INF|NaN)\s*$/.test(value)) {  // INF, -INF and NaN aren't valid literals in Turtle
        $.extend(this, $.typedValue(value, xsdNs + 'double'));
      } else {
        m = literalRegex.exec(value);
        if (m !== null) {
          this.value = (m[2] || m[4]).replace(/\\"/g, '"');
          if (m[9]) {
            datatype = $.rdf.resource(m[9], opts);
            $.extend(this, $.typedValue(this.value, datatype.uri));
          } else if (m[7]) {
            this.lang = m[7];
          }
        } else {
          throw "Malformed Literal: Couldn't recognise the value " + value;
        }
      }
      return this;
    }, // end init
    
    toString: function () {
      var val = '"' + this.value + '"';
      if (this.lang !== undefined) {
        val += '@' + this.lang;
      } else if (this.datatype !== undefined) {
        val += '^^<' + this.datatype + '>';
      }
      return val;
    }
  };

  $.rdf.literal.fn.init.prototype = $.rdf.literal.fn;
  
  $.rdf.literal.defaults = {
    base: $.uri.base(),
    namespaces: {},
    datatype: undefined,
    lang: undefined
  };

})(jQuery);