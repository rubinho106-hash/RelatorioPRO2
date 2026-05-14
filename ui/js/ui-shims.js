(function () {
  'use strict';
  function getElements(selector) {
    if (selector === document || selector === window) {
      return [selector];
    }

    if (selector instanceof Element || selector instanceof HTMLDocument) {
      return [selector];
    }

    if (Array.isArray(selector)) {
      return selector;
    }

    if (typeof selector === "string") {
      return Array.from(document.querySelectorAll(selector));
    }

    return [];
  }

  function showModalElement(element) {
    if (!element) return;
    element.classList.add("show");
    element.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function hideModalElement(element) {
    if (!element) return;
    element.classList.remove("show");
    element.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".modal.show")) {
      document.body.classList.remove("modal-open");
    }
  }

  function safeStorey(value) {
    return (value == null ? '' : String(value)).toUpperCase().trim();
  }

  function storeySortNumber(storeyName) {
    var raw = safeStorey(storeyName);
    if (raw.indexOf('TERREO') >= 0) { return 0; }
    if (raw.indexOf('SEM PAVIMENTO') >= 0) { return Number.MAX_SAFE_INTEGER; }
    var match = raw.match(/\d+/);
    return match ? parseInt(match[0], 10) : 999999;
  }

  function relatorioSortStoreys(storeys) {
    var list = Array.isArray(storeys) ? storeys.slice() : [];
    list.sort(function (a, b) {
      var aName = safeStorey(a && a.storey);
      var bName = safeStorey(b && b.storey);
      var na = storeySortNumber(aName);
      var nb = storeySortNumber(bName);
      if (na !== nb) { return na - nb; }
      return aName.localeCompare(bName, 'pt-BR');
    });
    return list;
  }

  function DollarCollection(selector) {
    this.elements = getElements(selector);
  }

  DollarCollection.prototype.each = function (callback) {
    this.elements.forEach(function (element, index) {
      callback.call(element, index, element);
    });
    return this;
  };

  DollarCollection.prototype.text = function (value) {
    if (value === undefined) {
      return this.elements[0] ? this.elements[0].textContent : undefined;
    }

    this.elements.forEach(function (element) {
      element.textContent = value;
    });
    return this;
  };

  DollarCollection.prototype.attr = function (name, value) {
    if (value === undefined) {
      return this.elements[0] ? this.elements[0].getAttribute(name) : undefined;
    }

    this.elements.forEach(function (element) {
      element.setAttribute(name, value);
    });
    return this;
  };

  DollarCollection.prototype.on = function (eventName, handler) {
    this.elements.forEach(function (element) {
      element.addEventListener(eventName, function (event) {
        handler.call(element, event);
      });
    });
    return this;
  };

  DollarCollection.prototype.val = function (value) {
    if (value === undefined) {
      return this.elements[0] ? this.elements[0].value : undefined;
    }

    this.elements.forEach(function (element) {
      element.value = value;
    });
    return this;
  };

  DollarCollection.prototype.ready = function (handler) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", handler);
    } else {
      handler();
    }
    return this;
  };

  DollarCollection.prototype.modal = function (action) {
    this.elements.forEach(function (element) {
      if (action === "show") {
        showModalElement(element);
      } else if (action === "hide") {
        hideModalElement(element);
      }
    });
    return this;
  };

  function $(selector) {
    return new DollarCollection(selector);
  }

  $.ajax = function (options) {
    fetch(options.url, {
      method: options.method || "GET"
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Request failed: " + response.status);
        }
        return options.dataType === "json" ? response.json() : response.text();
      })
      .then(function (data) {
        if (typeof options.success === "function") {
          options.success(data);
        }
      })
      .catch(function (error) {
        if (typeof options.error === "function") {
          options.error(error);
        }
      });
  };

  document.addEventListener("click", function (event) {
    var dismissButton = event.target.closest("[data-dismiss='modal']");
    if (dismissButton) {
      var modal = dismissButton.closest(".modal");
      hideModalElement(modal);
      return;
    }

    var backdropModal = event.target.classList.contains("modal") ? event.target : null;
    if (backdropModal) {
      hideModalElement(backdropModal);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      document.querySelectorAll(".modal.show").forEach(hideModalElement);
    }
  });

  window.$ = $;
  window.showModalElement = showModalElement;
  window.hideModalElement = hideModalElement;
  window.relatorioSortStoreys = relatorioSortStoreys;
})();