// furl.js

var furl = (function() {
  // For debugging
  var globals = {
  };

  var trace = {
    active: 0,
    activate: function() {
      ++trace.active;
    },
    deactivate: function() {
      --trace.active;
    },
    message: function (m) {
      if (trace.active > 0) {
        console.log(m);
      }
    }
  };

  var promise = function() {
    var p = {
      fulfilled: null,
      fulfill: function(p1, p2, p3, p4, p5) {
//if (!Array.isArray(p1)) {
//console.log('Promise fulfilled with non-array!');
//noSuchFunction();
//}
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
        trace.message('data.processQueue: Skipping because sessionId is blank');
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
        trace.message('data.processQueue: Skipping because nothing to do');
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
              trace.message('data.processQueue: Update not ok');
              console.log(xhttp.responseText);
            } else {
              trace.message('data.processQueue: Update ok');
              
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

      trace.message('data.processQueue: Sending update request');
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

  var namespace = function(parents) {
    var ns = {
      key: data.randomKey(),
      name: 'root',
      parents: parents,
      vars: {},
      set: function(name, value) {
        var ucName = name.toUpperCase();
        ns.vars[ucName] = value;
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
      setAtDefinition: function(name, value) {
        var ucName = name.toUpperCase();
        if (ucName in ns.vars) {
          ns.vars[ucName] = value;
//console.log(['Set!', value]);
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
      newChildNamespace: function(name, otherParents) {
        var childParents = [ns];
        if (otherParents != null) {
          for (var i = 0; i < otherParents.length; ++i) {
            childParents.push(otherParents[i]);
          }
        }
        var newChild = namespace(childParents);
        newChild.name = name;
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

  var newBinding = function(element) {
    var binding = {
      key: data.randomKey(),
      element: element,
      modelType: 'Z', // Zero bindings
      model: {},
      unnamed: [],
      original: {},
      par: null,

      addToModel: function(bindings) {
//console.log('Adding to model for ' + binding.debugPath());
        for (var i = 0; i < bindings.length; ++i) {
          var child = bindings[i];
//console.log('    Adding ' + child.debugPath());

          child.par = binding;
//console.log(child);
          child.addChangeListener(binding.notifyChange);

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

      debugPath: function() {
        if (binding.par != null) {
          var prefix = binding.par.debugPath() + '.';
        } else {
          var prefix = '';
        }

        return prefix + element.tagName + (('name' in element.attributes)
          ? '[' + element.attributes.name.value + ']'
          : '');
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

      // For percolating change messages up
      changeListeners: [],
      addChangeListener: function(f) {
        binding.changeListeners.push(f);
      },
      notifyChange: function() {
//console.log('Received notification of change at ' + binding.debugPath());
//console.log('    Passing on to ' + binding.changeListeners.length.toString()
//+ ' listeners');
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

      runScripts: function(scripts, namespace) {
        for (var i = 0; i < scripts.length; ++i) {
          try {
            eval('var fn = function(binding, namespace) {' + scripts[i] + '}');
            try {
              fn(binding, namespace);
            } catch (e2) {
              console.log('Error evaluating script: ' + e2.toString());
              console.log(scripts[i]);
            }
          } catch (e1) {
            console.log('Syntax error in script: ' + e1.toString());
            console.log(scripts[i]);
          }
        }
      },

      setValueFromDataSource: function() {
        if ('bind' in binding.attributes) {
//console.log('Setting value from data source');
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

      focus: function() {
        for (var name in binding.model) {
          binding.model[name].focus();
          return;
        }

        for (var i = 0; i < binding.unnamed.length; ++i) {
          binding.unnamed[i].focus();
          return;
        }
      },

      postProcess: function() {
      },

      notifyShow: function() {
        binding.setValueFromDataSource();

        for (var name in binding.model) {
          binding.model[name].notifyShow();
        }

        for (var i = 0; i < binding.unnamed.length; ++i) {
          binding.unnamed[i].notifyShow();
        }
      }
    };

    for (var i = 0; i < element.attributes.length; ++i) {
      var attr = element.attributes[i];
      binding.attributes[attr.name] = attr.value;
    }

//console.log(binding.debugPath());
    if ('global' in binding.attributes) {
      globals[binding.attributes.global] = binding;
    }

    return binding;
  };

  var interpretTag = function(element, ns) {
    var prom = promise();

    if ('ftype' in element.attributes) {
      var fullTagName = element.tagName + '.'
        + element.attributes.ftype.value.toUpperCase();
    } else {
      var fullTagName = element.tagName;
    }

//console.log('Interpreting: ' + sourceContext);
    if ('trace' in element.attributes) {
      trace.activate();
    }

    trace.message('Processing tag ' + fullTagName);

    var interpreter = ns.get(fullTagName);
    if (interpreter != null) {
      trace.message('  Found a custom tag definition');

      interpreter(element, ns).then(function(bindings, scripts) {
//console.log('    Promise fulfilled');
//console.log([bindings, scripts]);
        var container = element.parentElement;
        var bindsToExistingElement = false;

//console.log(bindings);
//console.log('Number of bindings returned by interpreter: '
//+ bindings.length.toString());
        trace.message('  Inserting replacement element(s) into parent');

        for (var i = 0; i < bindings.length; ++i) {
          var binding = bindings[i];

          if (binding.element == element) {
            bindsToExistingElement = true;
          } else {
            if (container != null) {
//console.log('Inserting ' + binding.element.tagName + ' before ' + element.tagName);
              container.insertBefore(binding.element, element);
            }
          }
        }

        if ((!bindsToExistingElement) && container != null) {
          trace.message('  Removing original custom tag because it does not bind to an existing element');
//console.log('Removing ' + element.tagName);
          container.removeChild(element);
        }

        prom.fulfill(bindings, scripts);
      });
    } else {
//console.log('No interpreter for ' + fullTagName);
//if (element.tagName == 'TABLE.DYNAMIC') {
//console.log(ns);
//}
      trace.message('  No custom tag definition found');

      if ('value' in element) {
        trace.message('  Creating simple binding for element with value');
//console.log('252: Tag not found in namespace: ' + element.tagName);
//console.log(ns);
        var binding = newBinding(element);

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

        interpretChildElements(element, ns)
          .then(function(bindings, scripts) {
          binding.addToModel(bindings);
          binding.runScripts(scripts, ns);
          //binding.setValueFromDataSource();
          binding.postProcess();
          prom.fulfill([binding], []);
        });
      } else if ('name' in element.attributes) {
        trace.message('  Creating simple binding for element with name');

        var binding = newBinding(element);

        interpretChildElements(element, ns)
          .then(function(bindings, scripts) {
          binding.addToModel(bindings);
          binding.runScripts(scripts, ns);
          //binding.setValueFromDataSource();
          binding.postProcess();
          prom.fulfill([binding], []);
        });
      } else {
        trace.message('  Creating no binding for element');

        interpretChildElements(element, ns)
          .then(function(bindings, scripts) {
          prom.fulfill(bindings, scripts);
        });
      }
    }

    return prom;
  };

  var interpretChildElements = function(container, ns) {
    var interpreterPromise = promise();
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

        interpretTag(element, ns)
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

  var root = namespace();
  root.newLibraryNamespace = function(name) {
    var ns = root.newChildNamespace(name);
    ns.exported = {};
    return ns;
  };

  root.set('CLASS', function(template, definingNamespace) {
    var classPromise = promise();

    if (!('name' in template.attributes)) {
      console.log('Error: CLASS requires a NAME attribute');
      classPromise.fulfull([]);
      return classPromise;
    }

//console.log('321: CLASS ' + template.attributes.name.value);

    var interpreter = function(element, includingNamespace) {
//console.log('Calling class interpreter');
      var instancePromise = promise();
      var instanceNamespace = definingNamespace.newChildNamespace('INST',
        [includingNamespace]);

      // Define the <CONTENT> tag so it can be referenced within the class
      // 
      instanceNamespace.set('CONTENT', function(e, n, psc) {
        var contentBinding = newBinding(document.createElement('SPAN'));
        var contentPromise = promise();
        // Evaluate content in a combination of the defining namespace and
        // the declaring namespace
        var contentNamespace = instanceNamespace.newChildNamespace(
          'CONTENT.instance+context=content',
          [n, includingNamespace]);

        contentBinding.element.innerHTML = element.innerHTML + e.innerHTML;

        interpretChildElements(contentBinding.element, contentNamespace)
          .then(function(bindings, scripts) {
            contentBinding.addToModel(bindings);
            contentBinding.runScripts(scripts, contentNamespace);
            //contentBinding.setValueFromDataSource();

            if (e.parentElement != null) {
              var par = e.parentElement;
              par.insertBefore(contentBinding.element, e);
              par.removeChild(e);
            }

            contentBinding.postProcess();
            contentPromise.fulfill([contentBinding], []);
          });

        return contentPromise;
      });

      // The instance of the class is a child of the including document
      var instanceBinding = newBinding(element);

      var preScripts = [];
      var childElement = template.firstElementChild;
      while (childElement != null) {
        if (childElement.tagName == 'SCRIPT') {
          if ('preprocess' in childElement.attributes) {
            preScripts.push(childElement.innerText);
          }
        }

        childElement = childElement.nextElementSibling;
      }

      if (!('native' in template.attributes)) {
        instanceBinding.element = document.createElement('SPAN');
        instanceBinding.element.innerHTML = template.innerHTML;
      }

      instanceBinding.runScripts(preScripts, instanceNamespace);

      interpretChildElements(instanceBinding.element, instanceNamespace)
        .then(
        function(bindings, scripts) {
          instanceBinding.addToModel(bindings);
          instanceBinding.runScripts(scripts, instanceNamespace);
          //instanceBinding.setValueFromDataSource();
//console.log('Fulfilling class instance promise');
          instanceBinding.postProcess();
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

  var interpretLibrary = function(libraryContent, declaringNamespace, usingElement) {
    var prom = promise();

    // Library bindings don't need parents
    var libraryBinding = newBinding(document.createElement('SPAN'));
    libraryBinding.element.innerHTML = libraryContent;
    var libraryNamespace = root.newLibraryNamespace(
      usingElement.attributes.src.value);
    interpretTag(libraryBinding.element, libraryNamespace)
      .then(function(bindings, libraryScripts) {
        // Import everything from the library into this namespace
        var contentNamespace = declaringNamespace.newChildNamespace('USING');
        for (var name in libraryNamespace.exported) {
          contentNamespace.set(name, libraryNamespace.exported[name]);
        }

        var usingBinding = newBinding(usingElement);
        usingBinding.element = document.createElement('SPAN');
        usingBinding.element.innerHTML = usingElement.innerHTML;
        interpretChildElements(usingBinding.element, contentNamespace)
          .then(function(bindings, scripts) {
          if (usingElement.parentElement != null) {
            var par = usingElement.parentElement;
            par.insertBefore(usingBinding.element, usingElement);
            par.removeChild(usingElement);
          }

          usingBinding.postProcess();
          // Not sure about scripts...who will execute these, and where should
          // libraryScripts be executed?
          prom.fulfill(bindings, scripts);
        });
      });

    return prom;
  };

  root.set('USING', function(element, declaringNamespace) {
    var prom = promise();

    if (!('src' in element.attributes)) {
      console.log('Error: USING requires a SRC attribute');
      prom.fulfill([], []);
      return prom;
    }
//console.log('399: USING ' + element.attributes.src.value);

    var path = element.attributes.src.value;
    if (path in sourceCache) {
      return interpretLibrary(sourceCache[path], declaringNamespace, element);
    }

    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (xhttp.readyState == 4) {
        if (xhttp.status == 200) {
          sourceCache[path] = xhttp.responseText;
          interpretLibrary(xhttp.responseText, declaringNamespace, element)
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
  root.set('SCRIPT', function(element, namespace) {
    var prom = promise();

    // If this script is marked 'preprocess' then don't send its text back,
    // that will be handled in the CLASS handler
    if ('preprocess' in element.attributes) {
       prom.fulfill([], []);
    } else {
      prom.fulfill([], [element.innerText]);
    }
    return prom;
  });

  var furl = {
    process: function(element) {
      var prom = promise();
      var binding = newBinding(element);
      var ns = root.newChildNamespace('TOP');

      var p = interpretChildElements(element, ns, 'TOP');

      p.then(function(bs, scripts) {
        binding.addToModel(bs);
        binding.runScripts(scripts, ns);
        binding.notifyShow();
        binding.postProcess();
        prom.fulfill(binding, []);
      });
      return prom;
    },
    login: data.login,
    pageBinding: null,
    loadPage: function(url, target) {
      var prom = promise();
      var binding = newBinding(document.createElement('SPAN'));
      furl.pageBinding = binding;
      var ns = root.newChildNamespace('PAGE');

      var targetToUse = (target == null ? document.body : target);

      var xhttp = new XMLHttpRequest();
      xhttp.onreadystatechange = function() {
        if (xhttp.readyState == 4) {
          if (xhttp.status == 200) {
            binding.element.innerHTML = xhttp.responseText;
            interpretChildElements(binding.element, ns, url)
              .then(function(bs, scripts) {
                binding.addToModel(bs);
                binding.runScripts(scripts, ns);
                binding.notifyShow();
                targetToUse.innerHTML = '';
                targetToUse.appendChild(binding.element);
                binding.postProcess();
                prom.fulfill(binding, []);
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
    data: data,
    trace: trace,

    // For debugging
    global: globals
  };

  return furl;
})();

