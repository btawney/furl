// furl.js

var furl = (function() {
  var data = {
    collections: {},
    getValue: function(collection, item) {
      if (collection in data.collections) {
        var c = data.collections[collection];
        if (item in c) {
          return c[item];
        }
      }

      return null;
    },
    setValue: function(collection, item, value) {
      if (collection in data.collections) {
        var c = data.collections[collection];
      } else {
        var c = {};
        data.collections[collection] = c;
      }

      c[item] = value;
    }
  };

  var namespace = function(par) {
    var ns = {
      parent: par,
      vars: {},
      set: function(name, value) {
        var ucName = name.toUpperCase();
        ns.vars[ucName] = value;
      },
      get: function(name, dflt) {
        var ucName = name.toUpperCase();
        if (ucName in ns.vars) {
          return ns.vars[ucName];
        } else if (par != null) {
          return par.get(ucName, dflt);
        } else {
          return dflt;
        }
      },
      new: function() {
        return namespace(ns);
      },
      export: function(name, value) {
        if ('exported' in ns) {
          ns.exported[name] = value;
        } else if (par != null) {
          par.export(name, value);
        } else {
          console.log('Warning: EXPORT specified outside of library');
        }
      }
    };
    return ns;
  };

  var newDocBinding = function() {
    var binding = {
      element: null,
      model: {},
      unnamed: [],
      original: {},
      modelType: function() {
        for (var name in binding.model) {
          return 'N'; // Elements modeled by name
        }
        if (binding.unnamed.length == 1) {
          return 'S'; // Single unnamed binding
        }
        return 'M'; // Multiple unnamed bindings
      },
      getValue: function() {
        switch (binding.modelType()) {
          case 'N':
            for (var name in binding.model) {
              binding.original[name] = binding.model[name].getValue();
            }
            return binding.original;
          case 'S':
            return binding.unnamed[0].getValue();
          case 'M':
            var result = [];
            for (var i = 0; i < binding.unnamed.length; ++i) {
              result.push(binding.unnamed[i]);
            }
            return result;
        }
        return null;
      },
      setValue: function(v) {
        binding.original = v;

        switch (binding.modelType()) {
          case 'N':
            for (var name in binding.model) {
              if (name in v) {
                binding.model[name].setValue(v[name]);
              }
            }
            break;
          case 'S':
            binding.unnamed[0].setValue(v);
            break;
          case 'M':
            var max = Math.min(v.length, binding.unnamed.length);
            for (var i = 0; i < max; ++i) {
              binding.unnamed[i].setValue(v[i]);
            }
            break;
        }
      },

      attributes: {},
      copyAttributesFromElement: function(e) {
        for (var i = 0; i < e.attributes.length; ++i) {
          var attr = e.attributes[i];
          binding.attributes[attr.name] = attr.value;
        }
      },

      // For percolating change messages up
      changeListeners: [],
      addChangeListener: function(f) {
        binding.changeListeners.push(f);
      },
      notifyChange: function() {
        for (var i = 0; i < binding.changeListeners.length; ++i) {
          var f = binding.changeListeners[i];
          try {
            f();
          } catch (error) {
            console.log(error);
          }
        }

        if ('bind' in binding.attributes) {
          var dataPath = binding.attributes['bind'];
          var indexOfDot = dataPath.indexOf('.');
          if (indexOfDot == -1) {
            data.setValue('general', dataPath, binding.getValue());
          } else {
            var collection = dataPath.substr(0, indexOfDot);
            var item = dataPath.substr(indexOfDot + 1);
            data.setValue(collection, item, binding.getValue());
          }
        }
      },

      postInterpret: function() {
        if ('bind' in binding.attributes) {
          var dataPath = binding.attributes['bind'];
          var indexOfDot = dataPath.indexOf('.');
          if (indexOfDot == -1) {
            var v = data.getValue('general', dataPath);
            if (v != null) {
              binding.setValue(v);
            }
          } else {
            var collection = dataPath.substr(0, indexOfDot);
            var item = dataPath.substr(indexOfDot + 1);
            var v = data.getValue(collection, item);
            if (v != null) {
              binding.setValue(v);
            }
          }
        }
      },

      par: null,
      new: function() {
        var childBinding = newDocBinding();
        childBinding.par = binding;
        childBinding.addChangeListener(binding.notifyChange);
        return childBinding;
      },

      focus: function() {
        for (var name in binding.model) {
          binding.model[name].focus();
          return;
        }

        for (var i = 0; i < binding.unnamed.length; ++i) {
          binding.unnamed[i].focus();
          return;
        }
      }
    };
    return binding;
  };

  var promise = function() {
    var p = {
      fulfilled: null,
      fulfill: function(p1, p2, p3, p4, p5) {
        if (p.nextCall != null) {
          p.nextCall(p1, p2, p3, p4, p5);
        } else {
          p.fulfilled = [p1, p2, p3, p4, p5];
        }
      },
      nextCall: null,
      then: function(f) {
        if (p.fulfilled != null) {
          f(p.fulfilled[0], p.fulfilled[1], p.fulfilled[2], p.fulfilled[3],
            p.fulfilled[4]);
        } else {
          p.nextCall = f;
        }
      }
    };
    return p;
  };

  var processOneElement = function(element, docBinding, ns) {
    var prom = promise();
    var container = element.parentElement;

    if ('ftype' in element.attributes) {
      var fullTagName = element.tagName + '.'
        + element.attributes.ftype.value.toUpperCase();
    } else {
      var fullTagName = element.tagName;
    }

    var interpreter = ns.get(fullTagName, null);
    if (interpreter != null) {
//console.log('222: Tag found for: ' + element.tagName);
      interpreter(element, docBinding, ns).then(function(binding) {
        var bindsToExistingElement = false;

        if (binding != null) {
          if (binding.element == element) {
            bindsToExistingElement = true;
          } else if (binding.element != null) {
            container.insertBefore(binding.element, element);
          } else {
            var span = document.createElement('SPAN');
            span.innerText = 'Binding had no element';
            container.insertBefore(span, element);
          }

          if ('name' in element.attributes) {
            docBinding.model[element.attributes.name.value] = binding;
          } else {
            docBinding.unnamed.push(binding);
          }
        }

        if (!bindsToExistingElement) {
          container.removeChild(element);
        }

        prom.fulfill(binding);
      });
    } else {
      if ('name' in element.attributes) {
//console.log('252: Tag not found in namespace: ' + element.tagName);
//console.log(ns);
        var binding = docBinding.new();
        docBinding.model[element.attributes.name.value] = binding;

        binding.copyAttributesFromElement(element);

        processChildNodes(element, binding, ns).then(function(b) {
          binding.postInterpret();
          prom.fulfill(binding);
        });
      } else {
        processChildNodes(element, docBinding, ns).then(function(b) {
          prom.fulfill(b);
        });
      }
    }

    return prom;
  };

  var processChildNodes = function(markupOrNode, docBinding, ns) {
    var interpreterPromise = promise();

    if (typeof(markupOrNode) == 'string') {
      var container = document.createElement('SPAN');
      container.innerHTML = markupOrNode;
    } else {
      container = markupOrNode;
    }

    if (docBinding.element == null) {
      docBinding.element = container;
    }

    var recurseAcrossSiblings = function(element) {
      if (element == null) {
        interpreterPromise.fulfill();
      } else {
        var nextSibling = element.nextElementSibling;

        processOneElement(element, docBinding, ns).then(function() {
          recurseAcrossSiblings(nextSibling);
        });
      }
    };

    recurseAcrossSiblings(container.firstElementChild);

    return interpreterPromise;
  };

  var processMarkup = function(markup, docBinding, ns) {
    var container = document.createElement('SPAN');
    container.innerHTML = markup;
    return processChildNodes(container, docBinding, ns);
  };

  var root = namespace();
  root.newLibraryNamespace = function() {
    var ns = root.new();
    ns.exported = {};
    return ns;
  };

  root.set('CLASS', function(template, docBinding, definingNamespace) {
    var classPromise = promise();

    if (!('name' in template.attributes)) {
      console.log('Error: CLASS requires a NAME attribute');
      classPromise.fulfull(null);
      return classPromise;
    }

//console.log('321: CLASS ' + template.attributes.name.value);

    var interpreter = function(element, docBinding, includingNamespace) {
      var instancePromise = promise();
      var instanceNamespace = definingNamespace.new();

      // The instance of the class is a child of the including document
      var instanceBinding = docBinding.new();

      // Define the <CONTENT> tag so it can be referenced within the class
      instanceNamespace.set('CONTENT', function(e, b, n) {
        var contentPromise = promise();

        // Any instance of the content is a child of the instance of the class
        var contentBinding = instanceBinding.new();

        if (e != null) {
          contentBinding.copyAttributesFromElement(e);
        }

        var contentNamespace = includingNamespace.new();

        // Any classes defined in the instance namespace will be available
        // to the content namespace
        for (var name in instanceNamespace) {
          contentNamespace[name] = instanceNamespace[name];
        }

        processMarkup(element.innerHTML, contentBinding, contentNamespace).then(
          function(b) {
            contentBinding.postInterpret();
            contentPromise.fulfill(contentBinding);
          });

        return contentPromise;
      });

      // Copy attributes from element to binding
      instanceBinding.copyAttributesFromElement(element);

      if ('native' in template.attributes) {
        instanceBinding.element = element;
      }

      processMarkup(template.innerHTML, instanceBinding, instanceNamespace).then(
        function(b) {
          instanceBinding.postInterpret();
          instancePromise.fulfill(instanceBinding);
        });

      return instancePromise;
    };

    var tagName = template.attributes.name.value;

    // Make the class available to its neighbors
    if (definingNamespace.parent == null) {
      definingNamespace.set(tagName, interpreter);
    } else {
      definingNamespace.parent.set(tagName, interpreter);
    }

    // Export the class to users of its library
    if ('export' in template.attributes) {
      definingNamespace.export(tagName, interpreter);
    }

    classPromise.fulfill(null);

    return classPromise;
  });

  root.set('USING', function(element, docBinding, declaringNamespace) {
    var prom = promise();

    if (!('src' in element.attributes)) {
      console.log('Error: USING requires a SRC attribute');
      return null;
    }
//console.log('399: USING ' + element.attributes.src.value);

    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (xhttp.readyState == 4) {
        if (xhttp.status == 200) {
          // Library bindings don't need parents
          var libraryBinding = newDocBinding();
          var libraryNamespace = root.newLibraryNamespace();
          processMarkup(xhttp.responseText, libraryBinding, libraryNamespace)
            .then(function(b) {
              // Import everything from the library into this namespace
              var contentNamespace = declaringNamespace.new();
              for (var name in libraryNamespace.exported) {
                contentNamespace.set(name, libraryNamespace.exported[name]);
              }

              var newElement = document.createElement('SPAN');
              newElement.innerHTML = element.innerHTML;

              var binding = docBinding.new();
              processOneElement(newElement, binding, contentNamespace).then(function(b) {
                binding.setValue(binding.original);

                if (binding.element.parentElement != null) {
                  var par = binding.element.parentElement;
                  par.insertBefore(newElement, binding.element);
                  par.removeChild(binding.element);
                }
                binding.element = newElement;

                for (var name in binding.model) {
                  docBinding.model[name] = binding.model[name];
                }

//console.log('434: Fulfilling promise for USING ' + element.attributes.src.value);
                prom.fulfill(binding);
              });
            });
        } else {
          console.log('Error retrieving remote content: '
            + xhttp.status.toString());
          prom.fulfill(null);
        }
      }
    };
    xhttp.open('GET', element.attributes.src.value, true);
    xhttp.send();

    return prom;
  });
  root.set('SCRIPT', function(element, docBinding, namespace) {
    var prom = promise();

    var code = 'var fn = function(binding, namespace) {'
      + element.innerText + '};';
    eval(code);
    fn(docBinding, namespace);

    prom.fulfill(null);

    return prom;    
  });

  var furl = {
    processChildren: processChildNodes,
    processMarkup: processMarkup,
    processElement: processOneElement,
    process: function(markupOrNode) {
      var prom = promise();
      var binding = newDocBinding();

      if (typeof(markupOrNode) == 'string') {
        var p = processMarkup(markupOrNode, binding, root.new());
      } else {
        var p = processOneElement(markupOrNode, binding, root.new());
      }
      p.then(function(b) {
        binding.postInterpret();
        prom.fulfill(binding);
      });
      return prom;
    },
    getDataItem: function(collection, item) {
      return data.getValue(collection, item);
    }
  };

  return furl;
})();

