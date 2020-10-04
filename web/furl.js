// furl.js

var furl = (function() {
  var newPromise = function() {
    var p = {
      fulfilled: null,
      fulfill: function(p1, p2, p3, p4, p5) {
        for (var i = 0; i < p.listeners.length; ++i) {
          var f = p.listeners[i];
          try {
            f(p1, p2, p3, p4, p5);
          } catch (error) {
            console.log('Error evaluating fulfillment listener');
            console.log(error);
            console.log(f.toString());
          }
        }

        p.fulfilled = [p1, p2, p3, p4, p5];
      },
      then: function(f) {
        if (p.fulfilled != null) {
          f(p.fulfilled[0], p.fulfilled[1], p.fulfilled[2], p.fulfilled[3],
            p.fulfilled[4]);
        } else {
          p.listeners.push(f);
        }
      },
      listeners: []
    };
    return p;
  };

  var data = {
    sessionId: 'dummy',
    permissions: {
      app: {developer: false},
      collections: {}
    },
    randomKeyAlphabet: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890',
    randomKey: function() {
      var len = data.randomKeyAlphabet.length;
      var result = '';
      for (var i = 0; i < 20; ++i) {
        var idx = Math.floor(Math.random() * len);
        result += data.randomKeyAlphabet.substr(idx, 1);
      }
      return result;
    },
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
//console.log([collection, item, value]);
      if (collection in data.collections) {
        var c = data.collections[collection];
      } else {
        if (!data.permissions.app.developer) {
          console.log('Warning: User has no permission to create collections');
        }

        var c = {};
        data.collections[collection] = c;
      }

      if (item in c) {
        if (!(collection in data.permissions.collections
              && data.permissions.collections[collection].canUpdate)) {
          console.log('Warning: User has no permission to update collection');
        }
      } else {
        if (!(collection in data.permissions.collections
              && data.permissions.collections[collection].canInsert)) {
          console.log('Warning: User has no permission to insert into collection');
        }
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
        if (!(collection in data.permissions.collections
              && data.permissions.collections[collection].canDelete)) {
          console.log('Warning: User has no permission to delete from collection');
        }

        if (!(collection in data.deleteQueue)) {
          data.deleteQueue[collection] = {};
        }
        data.deleteQueue[collection][item] = c[item];
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
        return;
      }

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
      xhttp.send(JSON.stringify(message));
    },

    login: function(app, user, password) {
      var prom = newPromise();

      var xhttp = new XMLHttpRequest();
      xhttp.onreadystatechange = function() {
        if (xhttp.readyState == 4) {
          if (xhttp.status == 200) {
            try {
              var response = JSON.parse(xhttp.responseText);

              if ('result' in response && response.result == 'success') {
                data.collections = response.collections;
                data.sessionId = response.sessionId;
                data.permissions = response.permissions;
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

  window.setInterval(data.processQueue, 1000);

  var newNamespace = function(parents) {
    var ns = {
      key: data.randomKey(),
      name: 'root',
      parents: parents,
      vars: {},
      set: function(name, value) {
        var ucName = name.toUpperCase();
        ns.vars[ucName] = value;
      },
      setAtDefinition: function(name, value) {
        var ucName = name.toUpperCase();
        if (ucName in ns.vars) {
          ns.vars[ucName] = value;
          return true;
        } else if (parents != null) {
          for (var i = 0; i < parents.length; ++i) {
            var result = parents[i].setAtDefinition(ucName, value);

            if (result == true) {
              return result;
            }
          }
        }
        return false;
      },
      get: function(name) {
        var ucName = name.toUpperCase();
        if (ucName in ns.vars) {
          return ns.vars[ucName];
        } else if (parents != null) {
          for (var i = 0; i < parents.length; ++i) {
            var result = parents[i].get(ucName);

            if (result != null) {
              return result;
            }
          }
        } else {
          return null;
        }
      },
      newChildNamespace: function(otherParents) {
        var childParents = [ns];
        if (otherParents != null) {
          for (var i = 0; i < otherParents.length; ++i) {
            childParents.push(otherParents[i]);
          }
        }
        var newChild = newNamespace(childParents);
        return newChild;
      },
      export: function(name, value) {
        if ('exported' in ns) {
          ns.exported[name] = value;
        } else if (parents != null) {
          for (var i = 0; i < parents.length; ++i) {
            parents[i].export(name, value);
          }
        } else {
          console.log('Warning: EXPORT specified outside of library');
        }
      }
    };
    return ns;
  };

  var newEvent = function(scriptBody, sourceLocation, eventName) {
    var s = {
      eventName: eventName,
      scriptBody: scriptBody,
      sourceLocation: sourceLocation,
      compile: function(binding, namespace) {
        prom = newPromise();
        if (s.fn == null) {
          try {
            eval('s.fn = function(args) {' + scriptBody + '}');
          } catch (error) {
            console.log('Syntax error in script at ' + sourceLocation);
            console.log(error);
            console.log(scriptBody);
            s.fn = function() {
              console.log('Unable to run uncompiled script');
            };
          }
        }

        return s.fn;
      },
      fn: null
    };
    return s;
  };

  var newBinding = function(element, sourceLocation) {
    var binding = {
      key: data.randomKey(),
      element: element,
      sourceLocation: sourceLocation,
      modelType: 'Z', // Zero bindings
      model: {},
      unnamed: [],
      original: {},
      par: null,

      addToModel: function(bindings) {
        for (var i = 0; i < bindings.length; ++i) {
          var child = bindings[i];

          child.par = binding;

          // Pass change notification up the hierarchy
          child.addEventListener('change', binding.notifyChange);

          if ('name' in child.attributes) {
            binding.model[child.attributes.name] = child;
            binding.modelType = 'N'; // At least one named binding
          } else {
            binding.unnamed.push(child);
            if (binding.modelType == 'Z') {
              binding.modelType = 'S'; // One unnamed binding
            } else if (binding.modelType == 'S') {
              binding.modelType = 'M'; // Multiple unnamed bindings
            }
          }
        }
      },

      getValue: function() {
        switch (binding.modelType) {
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
          case 'Z':
            return [];
        }
        return null;
      },
      setValue: function(v) {
        binding.original = v;

        switch (binding.modelType) {
          case 'N':
            for (var name in binding.model) {
              if (typeof(v) == 'object' && v != null && name in v) {
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

      notifyInit: function() {
        binding.notifyEvent('init');
      },

      notifyChange: function() {
        binding.notifyEvent('change');

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

      notifyShow: function(args) {
        binding.notifyEvent('show', args);

        binding.setValueFromDataSource();

        for (var name in binding.model) {
          binding.model[name].notifyShow(args);
        }

        for (var i = 0; i < binding.unnamed.length; ++i) {
          binding.unnamed[i].notifyShow(args);
        }
      },

      notifyBind: function() {
        binding.notifyEvent('bind');
      },

      notifyHide: function() {
        binding.notifyEvent('hide');
      },

      eventListeners: {
        init: [],
        show: [],
        bind: [],
        hide: [],
        change: []
      },

      addEventListener: function(eventName, fn) {
        if (eventName in binding.eventListeners) {
          binding.eventListeners[eventName].push(fn);
        } else {
          binding.element.addEventListener(eventName, fn);
        }
      },
      notifyEvent: function(eventName, args) {
        if (eventName in binding.eventListeners) {
          for (var i = 0; i < binding.eventListeners[eventName].length; ++i) {
            var fn = binding.eventListeners[eventName][i];

            if (typeof(fn) == 'function') {
              try {
                fn(args);
              } catch (error) {
                console.log('Error calling event listener for ' + eventName);
                console.log(error);
                console.log(fn.toString());
              }
            } else if ('fn' in fn) {
              try {
                fn.fn(args);
              } catch (error) {
                console.log('Error calling event listener for ' + eventName);
                console.log(error);
                console.log(fn);
              }
            }
          }
        }
      },

      addEvents: function(scripts, namespace) {
        for (var i = 0; i < scripts.length; ++i) {
          var script = scripts[i];
          if (script.eventName != null) {
            script.compile(binding, namespace);
            binding.addEventListener(script.eventName, script);
          } else {
            try {
              script.compile(binding, namespace)();
            } catch (error) {
              console.log('Error evaluating unnamed event');
              console.log(error);
              console.log(script);
            }
          }
        }
      },

      setValueFromDataSource: function() {
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

          binding.notifyBind();
        }
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

    for (var i = 0; i < element.attributes.length; ++i) {
      var attr = element.attributes[i];
      binding.attributes[attr.name] = attr.value;
    }

    return binding;
  };

  var interpretTag = function(element, ns, sourceLocation) {
    var prom = newPromise();

    if ('ftype' in element.attributes) {
      var fullTagName = element.tagName + '.'
        + element.attributes.ftype.value.toUpperCase();
    } else {
      var fullTagName = element.tagName;
    }

    var interpreter = ns.get(fullTagName);
    if (interpreter != null) {
      interpreter(element, ns, sourceLocation)
        .then(function(bindings, scripts) {
        var container = element.parentElement;

        // Is the element its parent's last child?
        if (element.nextElementSibling == null) {
          var isLastElement = true;
        } else {
          var isLastElement = false;
        }

        // Insert bindings returned from evaluation around existing element
        // and determine whether existing element is still bound to something
        var bindsToExistingElement = false;

        for (var i = 0; i < bindings.length; ++i) {
          var binding = bindings[i];

          if (binding.element == element) {
            bindsToExistingElement = true;
          } else {
            if (container != null) {
              if (bindsToExistingElement == false) {
                container.insertBefore(binding.element, element);
              } else {
                if (isLastElement) {
                  container.appendChild(binding.element);
                } else {
                  container.insertBefore(binding.element, 
                    element.nextElementSibling);
                }
              }
            }
          }
        }

        if ((!bindsToExistingElement) && container != null) {
          container.removeChild(element);
        }

        prom.fulfill(bindings, scripts);
      });
    } else {
      if ('value' in element) {
        var binding = newBinding(element, sourceLocation);

        //binding.element = document.createElement('INPUT');
        binding.setValue = function(v) {
          binding.element.value = v.toString();
        };
        binding.getValue = function() {
          return binding.element.value;
        };
        binding.element.addEventListener('focus', function(evt) {
          binding.valueOnFocus = binding.element.value;
        });
        binding.element.addEventListener('blur', function(evt) {
          if (binding.element.value != binding.valueOnFocus) {
            binding.notifyChange();
          }
        });
        binding.focus = function() {
          binding.element.focus();
        };

        interpretChildElements(element, ns, sourceLocation)
          .then(function(bindings, scripts) {
          binding.addToModel(bindings);
          binding.addEvents(scripts, ns);
          binding.notifyInit();
          prom.fulfill([binding], []);
        });
      } else if ('name' in element.attributes) {
        var binding = newBinding(element, sourceLocation);

        interpretChildElements(element, ns, sourceLocation)
          .then(function(bindings, scripts) {
          binding.addToModel(bindings);
          binding.addEvents(scripts, ns);
          binding.notifyInit();
          prom.fulfill([binding], []);
        });
      } else {
        interpretChildElements(element, ns, sourceLocation)
          .then(function(bindings, scripts) {
          prom.fulfill(bindings, scripts);
        });
      }
    }

    return prom;
  };

  var interpretChildElements = function(container, ns, sourceLocation) {
    var interpreterPromise = newPromise();
    var childBindings = [];
    var childScripts = [];

    var recurseAcrossSiblings = function(element) {
      if (element == null) {
//console.log('Processing done, fulfilling promise to interpret child elements of ' + container.tagName);
        interpreterPromise.fulfill(childBindings, childScripts);
      } else {
//console.log('Processing element ' + 
//((element.parentElement == null) ? '' : element.parentElement.tagName + '.')
//+ element.tagName);
//console.log(element);
        var nextSibling = element.nextElementSibling;

        interpretTag(element, ns, sourceLocation + '.' + element.tagName)
          .then(function(bindings, scripts) {
          for (var i = 0; i < bindings.length; ++i) {
            childBindings.push(bindings[i]);
          }
//console.log('Ready to process next sibling');

          for (var i = 0; i < scripts.length; ++i) {
            childScripts.push(scripts[i]);
          }

          recurseAcrossSiblings(nextSibling);
        });
      }
    };

    recurseAcrossSiblings(container.firstElementChild);

    return interpreterPromise;
  };

  var processMarkup = function(markup, ns) {
//console.log(markup);
    var container = document.createElement('SPAN');
    container.innerHTML = markup;
    return processChildElements(container, ns);
  };

  var root = newNamespace();
  root.newLibraryNamespace = function() {
    var ns = root.newChildNamespace();
    ns.exported = {};
    return ns;
  };

  root.set('CLASS', function(template, definingNamespace, sourceLocation) {
    var classPromise = newPromise();

    if (!('name' in template.attributes)) {
      console.log('Error: CLASS requires a NAME attribute');
      classPromise.fulfull([]);
      return classPromise;
    }

//console.log('321: CLASS ' + template.attributes.name.value);

    var interpreter = function(element, includingNamespace, instanceSourceLocation) {
//console.log('Calling class interpreter');
      var instancePromise = newPromise();
      var instanceNamespace
        = definingNamespace.newChildNamespace([includingNamespace]);

      // Define the <CONTENT> tag so it can be referenced within the class.
      instanceNamespace.set('CONTENT', function(e, n, contentSourceLocation) {
        // If the class creates an instance of the CONTENT tag, it doesn't
        // need to know the instance source location
        if (contentSourceLocation == null) {
          var sourceLocationToUse = instanceSourceLocation;
        } else {
          var sourceLocationToUse = contentSourceLocation;
        }

        var contentBinding = newBinding(
          document.createElement('SPAN'),
          sourceLocationToUse);
        var contentPromise = newPromise();
        // Evaluate content in a combination of the defining namespace and
        // the declaring namespace
        var contentNamespace
          = instanceNamespace.newChildNamespace([n, includingNamespace]);

        contentBinding.element.innerHTML = element.innerHTML + e.innerHTML;

        interpretChildElements(contentBinding.element, contentNamespace,
          sourceLocationToUse)
          .then(function(bindings, scripts) {
            contentBinding.addToModel(bindings);
            contentBinding.addEvents(scripts, contentNamespace);

            // If the CONTENT tag was in a document, replace it with whatever
            // the binding element is
            if (e.parentElement != null) {
              var par = e.parentElement;
              par.insertBefore(contentBinding.element, e);
              par.removeChild(e);
            }

            contentBinding.notifyInit();
            contentPromise.fulfill([contentBinding], []);
          });

        return contentPromise;
      });

      // The instance of the class is a child of the including document
      var instanceBinding = newBinding(element, instanceSourceLocation);

      if (!('native' in template.attributes)) {
        instanceBinding.element = document.createElement('SPAN');
        instanceBinding.element.innerHTML = template.innerHTML;
      } else {
        // For native tags, the scripts defined in the CLASS definition
        // will not be copied to the DOM, so they won't be picked up when
        // the tag is evaluated. For that reason, add them to the model here
        var childElement = template.firstElementChild;
        while (childElement != null) {
          if (childElement.tagName == 'SCRIPT') {
            // Second parameter, namespace, not currently used
            root.vars.SCRIPT(childElement, null, instanceSourceLocation)
              .then(function(bs, ss) {
              instanceBinding.addEvents(ss, instanceNamespace);
            });
          }

          childElement = childElement.nextElementSibling;
        }
      }

      interpretChildElements(instanceBinding.element, instanceNamespace,
        instanceSourceLocation)
        .then(
          function(bindings, scripts) {
            instanceBinding.addToModel(bindings);
            instanceBinding.addEvents(scripts, instanceNamespace);
            instanceBinding.notifyInit();
            instancePromise.fulfill([instanceBinding], []);
          });

      return instancePromise;
    };

    var tagName = template.attributes.name.value;

    // Make the class available to its neighbors
    if (definingNamespace.parent == null) {
      definingNamespace.set(tagName, interpreter);
//console.log([tagName, definingNamespace]);
    } else {
      definingNamespace.parent.set(tagName, interpreter);
//console.log([tagName, definingNamespace.parent]);
    }

    // Export the class to users of its library
    if ('export' in template.attributes) {
      definingNamespace.export(tagName, interpreter);
    }

    classPromise.fulfill([], []);

    return classPromise;
  });

  var sourceCache = {};

  var interpretLibrary = function(libraryContent, declaringNamespace, usingElement, usingSourceLocation) {
    var prom = newPromise();

    // Library bindings don't need parents
    var libraryBinding = newBinding(document.createElement('SPAN'),
      usingElement.attributes.src.value);
    libraryBinding.element.innerHTML = libraryContent;
    var libraryNamespace = root.newLibraryNamespace(
      usingElement.attributes.src.value);
    interpretTag(libraryBinding.element, libraryNamespace, usingElement.attributes.src.value)
      .then(function(bindings, libraryScripts) {
        // Import everything from the library into this namespace
        var contentNamespace = declaringNamespace.newChildNamespace();
        for (var name in libraryNamespace.exported) {
          contentNamespace.set(name, libraryNamespace.exported[name]);
        }

        var usingBinding = newBinding(usingElement, usingSourceLocation);
        usingBinding.element = document.createElement('SPAN');
        usingBinding.element.innerHTML = usingElement.innerHTML;
        interpretChildElements(usingBinding.element, contentNamespace,
          usingSourceLocation)
          .then(function(bindings, scripts) {
          if (usingElement.parentElement != null) {
            var par = usingElement.parentElement;
            par.insertBefore(usingBinding.element, usingElement);
            par.removeChild(usingElement);
          }

          usingBinding.notifyInit();
          // Not sure about scripts...who will execute these, and where should
          // libraryScripts be executed?
          prom.fulfill(bindings, scripts);
        });
      });

    return prom;
  };

  root.set('USING', function(element, declaringNamespace, sourceLocation) {
    var prom = newPromise();

    if (!('src' in element.attributes)) {
      console.log('Error: USING requires a SRC attribute');
      prom.fulfill([], []);
      return prom;
    }
//console.log('399: USING ' + element.attributes.src.value);

    var path = element.attributes.src.value;
    if (path in sourceCache) {
      return interpretLibrary(sourceCache[path], declaringNamespace, element,
        sourceLocation);
    }

    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (xhttp.readyState == 4) {
        if (xhttp.status == 200) {
          sourceCache[path] = xhttp.responseText;
          interpretLibrary(xhttp.responseText, declaringNamespace, element,
            sourceLocation)
            .then(function(bs, ss) {
              prom.fulfill(bs, ss);
            });
        } else {
          console.log('Error retrieving remote content: '
            + xhttp.status.toString());
          prom.fulfill([], []);
        }
      }
    };
    xhttp.open('GET', path + '?' + data.sessionId, true);
    xhttp.send();

    return prom;
  });
  root.set('SCRIPT', function(element, namespace, sourceLocation) {
    var prom = newPromise();

    if ('name' in element.attributes) {
      var script = newEvent(
        element.innerText,
        sourceLocation,
        element.attributes.name.value);
    } else {
      var script = newEvent(
        element.innerText,
        sourceLocation);
    }

    prom.fulfill([], [script]);

    return prom;
  });

  var furl = {
    elementPath: function(element) {
      var r = function(e) {
        if (e.parentElement == null) {
          return e.tagName;
        } else {
          return r(e.parentElement) + '.' + e.tagName;
        }
      };
      if (element.href != null) {
        return element.href + '.' + r(element);
      } else {
        return r(element);
      }
    },
    process: function(element) {
      var prom = newPromise();
      var binding = newBinding(element,
        furl.elementPath(element)
        );
      var ns = root.newChildNamespace();

      var p = interpretChildElements(element, ns, 'TOP');

      p.then(function(bs, scripts) {
        binding.addToModel(bs);
        binding.addEvents(scripts, ns);
        binding.notifyInit();
        prom.fulfill(binding, []);
        binding.notifyShow();
      });
      return prom;
    },
    login: data.login,
    pageBinding: null,
    loadPage: function(url, target) {
      var prom = newPromise();
      var binding = newBinding(
        document.createElement('SPAN'),
        url);
      furl.pageBinding = binding;
      var ns = root.newChildNamespace();

      var targetToUse = (target == null ? document.body : target);

      var xhttp = new XMLHttpRequest();
      xhttp.onreadystatechange = function() {
        if (xhttp.readyState == 4) {
          if (xhttp.status == 200) {
            binding.element.innerHTML = xhttp.responseText;
            interpretChildElements(binding.element, ns, url)
              .then(function(bs, scripts) {
                binding.addToModel(bs);
                binding.addEvents(scripts, ns);
                binding.notifyInit();
                targetToUse.innerHTML = '';
                targetToUse.appendChild(binding.element);
                prom.fulfill(binding, []);
                binding.notifyShow();
              });
          } else {
            target.innerHTML = 'Error: ' + xhttp.status.toString;
          }
        }
      };

      xhttp.open('GET', url + '?' + data.sessionId, true);
      xhttp.send(); 

      return prom;
    },
    data: data
  };

  return furl;
})();

