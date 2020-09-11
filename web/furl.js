// furl.js

var furl = (function() {
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

  var data = {
    sessionId: 'dummy',
    collections: {},
    pendingUpdateQueues: [],
    updateQueue: {},
    pendingDeleteQueues: [],
    deleteQueue: {},
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

      if (collection in data.updateQueue) {
        var q = data.updateQueue[collection];
      } else {
        var q = {};
        data.updateQueue[collection] = q;
      }

      q[item] = value;
    },
    deleteValue: function(collection, item) {
      if (collection in data.collections) {
        var c = data.collections[collection];
      } else {
        return;
      }

      if (item in c) {
        data.deleteQueue[item] = c[item];
        delete c[item];
      }
    },
    processQueue: function() {
      if (data.sessionId == '') {
        return;
      }

      var anythingToDo = false;
      for (var c in data.updateQueue) {
        if (anythingToDo) {
          break;
        }
        for (var i in data.updateQueue[c]) {
          anythingToDo = true;
          break;
        }
      }

      for (var c in data.deleteQueue) {
        if (anythingToDo) {
          break;
        }
        for (var i in data.deleteQueue[c]) {
          anythingToDo = true;
          break;
        }
      }

      if (!anythingToDo) {
//console.log('Nothing to do');
        return;
      }
//console.log('Processing queue');

      data.pendingUpdateQueues.push(data.updateQueue);
      data.pendingDeleteQueues.push(data.deleteQueue);

      data.updateQueue = {};
      data.deleteQueue = {};

      var message = {
        sessionId: data.sessionId,
        updates: {},
        deletes: {}
      };

      for (var i = 0; i < data.pendingUpdateQueues.length; ++i) {
        var uq = data.pendingUpdateQueues[i];
        for (var c in uq) {
          var queueCollection = uq[c];
          var messageCollection = {};
          message.updates[c] = messageCollection;
          for (var i in queueCollection) {
            messageCollection[i] = queueCollection[i];
          }
        }
      }

      for (var i = 0; i < data.pendingDeleteQueues.length; ++i) {
        var dq = data.pendingDeleteQueues[i];
        for (var c in dq) {
          var queueCollection = dq[c];
          var messageCollection = {};
          message.deletes[c] = messageCollection;
          for (var i in queueCollection) {
            messageCollection[i] = queueCollection[i];
          }
        }
      }

      var xhttp = new XMLHttpRequest();
      xhttp.onreadystatechange = function() {
        if (xhttp.readyState == 4) {
          if (xhttp.status == 200) {
            if (xhttp.responseText.trim() != 'ok') {
              console.log(xhttp.responseText);
            } else {
              // Small risk that a second update will start while a prior one
              // is still waiting to process. Address with locking?
              data.pendingUpdateQueues = [];
              data.pendingDeleteQueues = [];
            }
          } else {
            console.log('Error flushing write queue: ' + xhttp.status.toString());
          }
        }
      };

      xhttp.open('PUT', 'update.php', true);
//console.log(JSON.stringify(message));
      xhttp.send(JSON.stringify(message));
    },

    login: function(app, user, password) {
      var prom = promise();

      var xhttp = new XMLHttpRequest();
      xhttp.onreadystatechange = function() {
        if (xhttp.readyState == 4) {
          if (xhttp.status == 200) {
            try {
              var response = JSON.parse(xhttp.responseText);

              if ('result' in response && response.result == 'success') {
                data.collections = response.collections;
                data.sessionId = response.sessionId;
                prom.fulfill(true, response.sessionId);
              } else {
                prom.fulfill(false, response);
              }
            } catch (e) {
              prom.fulfill(false, e);
            }
          } else {
            prom.fulfill(false, xhttp.status);
          }
        }
      };

      xhttp.open('PUT', 'login.php', true);
      xhttp.send(JSON.stringify({app: app, user: user, password: password}));

      return prom;
    }
  };

  window.setInterval(data.processQueue, 10000);

  var namespace = function(par) {
    var ns = {
      name: 'root',
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
      newChildNamespace: function(name) {
        var newChild = namespace(ns);
        newChild.name = name;
        return newChild;
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
//console.log('binding for element');
//console.log(element);
//console.log(binding);
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
//else {
//console.log('No binding for element');
//console.log(element);
//}

        if (!bindsToExistingElement) {
          container.removeChild(element);
        }

        prom.fulfill(binding);
      });
    } else {
console.log('No interpreter for ' + element.tagName);
if (element.tagName == 'IMEINPUT') {
console.log(ns);
}
      if ('name' in element.attributes) {
//console.log('252: Tag not found in namespace: ' + element.tagName);
//console.log(ns);
        var binding = docBinding.new();
        docBinding.model[element.attributes.name.value] = binding;

        binding.copyAttributesFromElement(element);

        processChildElements(element, binding, ns).then(function(b) {
          binding.postInterpret();
          prom.fulfill(binding);
        });
      } else {
        processChildElements(element, docBinding, ns).then(function(b) {
          prom.fulfill(b);
        });
      }
    }

    return prom;
  };

  var processChildElements = function(markupOrNode, docBinding, ns) {
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
//console.log('Processing done, fulfilling promise');
        interpreterPromise.fulfill();
      } else {
//console.log('Processing element');
//console.log(element);
        var nextSibling = element.nextElementSibling;

        processOneElement(element, docBinding, ns).then(function() {
//console.log('Ready to process next sibling');
          recurseAcrossSiblings(nextSibling);
        });
      }
    };

    recurseAcrossSiblings(container.firstElementChild);

    return interpreterPromise;
  };

  var processMarkup = function(markup, docBinding, ns) {
//console.log(markup);
    var container = document.createElement('SPAN');
    container.innerHTML = markup;
    return processChildElements(container, docBinding, ns);
  };

  var root = namespace();
  root.newLibraryNamespace = function(name) {
    var ns = root.newChildNamespace(name);
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
      var instanceNamespace = definingNamespace.newChildNamespace(element.tagName);

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

        var contentNamespace = includingNamespace.newChildNamespace('CONTENT');

        // Any classes defined in the instance namespace will be available
        // to the content namespace
        for (var name in instanceNamespace) {
          contentNamespace[name] = instanceNamespace[name];
        }

console.log('Processing markup: ' + element.innerHTML);
        processMarkup(element.innerHTML, contentBinding, contentNamespace).then(
          function(b) {
console.log('Got a binding');
console.log(contentBinding);
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
      return prom;
    }
//console.log('399: USING ' + element.attributes.src.value);

    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (xhttp.readyState == 4) {
        if (xhttp.status == 200) {
          // Library bindings don't need parents
          var libraryBinding = newDocBinding();
          var libraryNamespace = root.newLibraryNamespace(element.attributes.src.value);
          processMarkup(xhttp.responseText, libraryBinding, libraryNamespace)
            .then(function(b) {
              // Import everything from the library into this namespace
              var contentNamespace = declaringNamespace.newChildNamespace('CONTENT');
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
    xhttp.open('GET', element.attributes.src.value + '?' + data.sessionId, true);
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
    processChildren: processChildElements,
    processMarkup: processMarkup,
    processElement: processOneElement,
    process: function(markupOrNode) {
      var prom = promise();
      var binding = newDocBinding();

      if (typeof(markupOrNode) == 'string') {
        var p = processMarkup(markupOrNode, binding, root.newChildNamespace('TOP'));
      } else {
        var p = processOneElement(markupOrNode, binding, root.newChildNamespace('TOP'));
      }
      p.then(function(b) {
        binding.postInterpret();
        prom.fulfill(binding);
      });
      return prom;
    },
    login: data.login,
    loadPage: function(url, target) {
      var prom = promise();
      var binding = newDocBinding();

      var targetToUse = (target == null ? document.body : target);

      var xhttp = new XMLHttpRequest();
      xhttp.onreadystatechange = function() {
        if (xhttp.readyState == 4) {
          if (xhttp.status == 200) {
            processMarkup(xhttp.responseText, binding, root.newChildNamespace('PAGE'))
              .then(function(b) {
                binding.postInterpret();
                targetToUse.innerHTML = '';
                targetToUse.appendChild(binding.element);
                prom.fulfill(binding);
              });
          } else {
            target.innerHTML = 'Error: ' + xhttp.status.toString;
          }
        }
      };

      xhttp.open('GET', url + '?' + data.sessionId, true);
      xhttp.send(); 
    },
    data: data
  };

  return furl;
})();

