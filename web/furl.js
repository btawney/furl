// furl.js

var furl = (function() {
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
      }
    };
    return binding;
  }

  var interpret = function(markupOrNode, docBinding, ns) {
    if (typeof(markupOrNode) == 'string') {
      var container = document.createElement('SPAN');
      container.innerHTML = markupOrNode;
    } else {
      container = markupOrNode;
    }

    if (docBinding.element == null) {
      docBinding.element = container;
    }

    var toProcess = [];
    for (var i = 0; i < container.children.length; ++i) {
      var element = container.children[i];
      toProcess.push(element);
    }

    for (var i = 0; i < toProcess.length; ++i) {
      var element = toProcess[i];

      var interpreter = ns.get(element.tagName, null);
      if (interpreter != null) {
        var binding = interpreter(element, docBinding, ns.new());
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
      } else {
        if ('name' in element.attributes) {
          var binding = newDocBinding();
          docBinding.model[element.attributes.name.value] = binding;
          interpret(element, binding, ns.new());
        } else {
          interpret(element, docBinding, ns.new());
        }
      }
    }
  };

  var root = namespace();

  root.set('CLASS', function(template, docBinding, definingNamespace) {
    if (!('name' in template.attributes)) {
      console.log('Error: CLASS requires a NAME attribute');
      return null;
    }

    var name = template.attributes.name.value;
    var interpreter = function(element, docBinding, includingNamespace) {
      var ns = definingNamespace.new();

      // Define the <CONTENT> tag
      ns.set('CONTENT', function(e, b, n) {
        var contentBinding = newDocBinding();
        interpret(element.innerHTML, contentBinding, includingNamespace.new());
        return contentBinding;
      });

      var thingBinding = newDocBinding();
      interpret(template.innerHTML, thingBinding, ns.new());

      // Copy attributes from element to binding
      thingBinding.attributes = {};
      for (var i = 0; i < element.attributes.length; ++i) {
        var attr = element.attributes[i];
        thingBinding.attributes[attr.name] = attr.value;
      }

      return thingBinding;
    };

    if (definingNamespace.parent == null) {
      definingNamespace.set(name, interpreter);
    } else {
      definingNamespace.parent.set(name, interpreter);
    }

    return null;
  });
  root.set('USING', function(element, docBinding, declaringNamespace) {
    if (!('src' in element.attributes)) {
      console.log('Error: USING requires a SRC attribute');
      return null;
    }

    var binding = newDocBinding();
    binding.element = document.createElement('SPAN');
    binding.element.innerText = 'Loading...';

    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (xhttp.readyState == 4) {
        if (xhttp.status == 200) {
          var libraryBinding = newDocBinding();
          var libraryNamespace = root.new();
          interpret(xhttp.responseText, libraryBinding, libraryNamespace);

          var contentNamespace = declaringNamespace.new();
          for (var name in libraryNamespace.vars) {
            contentNamespace.set(name, libraryNamespace.vars[name]);
          }

          var newElement = document.createElement('SPAN');
          newElement.innerHTML = element.innerHTML;

          interpret(newElement, binding, contentNamespace);
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
        } else {
          binding.element.innerText = 'Error retrieving remote content: '
            + xhttp.status.toString();
        }
      }
    };
    xhttp.open('GET', element.attributes.src.value, true);
    xhttp.send();

    return binding;
  });
  root.set('SCRIPT', function(element, docBinding, namespace) {
    var code = 'var fn = function(binding, namespace) {'
      + element.innerText + '};';
    eval(code);
    fn(docBinding, namespace);
  });

  var furl = {
    bind: function(markupOrNode) {
      var binding = newDocBinding();
      interpret(markupOrNode, binding, root.new());
      return binding;
    }
  };

  return furl;
})();

