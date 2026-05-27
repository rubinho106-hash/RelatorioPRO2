'use strict';

let cell;
let object_id;
let object_type;
let key;

function editHeaderCell(dataCell) {
  // Save current data
  let originalValue = dataCell.textContent;

  // Add padding to the dataCell
  dataCell.style.padding = "5px";

  // Create an input element
  let inputElement = document.createElement("input");
  inputElement.className = "form-control";
  inputElement.type = "text";
  inputElement.value = originalValue;

  // Add the input element into Cell
  dataCell.innerHTML = "";
  dataCell.appendChild(inputElement);

  // Focus on the input element
  inputElement.focus();

  // Flag to check if ESC key was pressed
  let escKeyPressed = false;

  // Function to handle changes and cleanup
  function finishEditing() {
    if (!escKeyPressed) {
      const value = inputElement.value;
      dataCell.textContent = value;
      dataCell.style.padding = "";
      inputElement.remove();

      if (value !== originalValue) {
        if (value === "") {
          dataCell.setAttribute("data-translate", dataCell.id);
          dataCell.classList.remove("modified");
          currentLanguage = localStorage.getItem("language") || "pt";
          loadLanguage(currentLanguage);
        } else {
          dataCell.textContent = value;
          dataCell.classList.add("modified");
        }
        itemName = `user_${dataCell.id}`;
        localStorage.setItem(itemName, value);
        customLog(`*. (Edit Header) User saved ${itemName} to: `, value);
      } else {
        dataCell.textContent = originalValue;
        dataCell.classList.remove("modified");

      }
    } else {
      // Restore the original value and clean up
      dataCell.textContent = originalValue;
      dataCell.style.padding = "";
      inputElement.remove();
    }
  }

  // Back to original when ESC key press
  inputElement.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      escKeyPressed = true;
      inputElement.blur(); // Trigger the 'blur' event
    }
  });

  // Finish editing on 'blur' event
  inputElement.addEventListener("blur", function () {
    finishEditing();
  });
}

function editCell(dataCell) {
  // Save current data
  let originalValue = dataCell.textContent;

  // Add padding to the dataCell
  dataCell.style.padding = "5px";

  // Create an input element
  let inputElement = document.createElement("input");
  inputElement.className = "form-control";
  inputElement.type = "text";
  inputElement.value = originalValue;

  // Add the input element into Cell
  dataCell.innerHTML = "";
  dataCell.appendChild(inputElement);

  // Focus on the input element
  inputElement.focus();

  // Flag to check if ESC key was pressed
  let escKeyPressed = false;

  // Function to handle changes and cleanup
  function finishEditing() {
    if (!escKeyPressed) {
      const value = inputElement.value;
      dataCell.textContent = value;
      dataCell.style.padding = "";
      inputElement.remove();

      if (value !== originalValue) {
        dataCell.textContent = value;
        handleValueChanged(value);
      } else {
        dataCell.textContent = originalValue;
      }
    } else {
      // Restore the original value and clean up
      dataCell.textContent = originalValue;
      dataCell.style.padding = "";
      inputElement.remove();
    }
  }

  // Back to original when ESC key press
  inputElement.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      escKeyPressed = true;
      inputElement.blur(); // Trigger the 'blur' event
    }
  });

  // Finish editing on 'blur' event
  inputElement.addEventListener("blur", function () {
    finishEditing();
  });
}

function editTextArea(dataCell) {
  // Store the original value before replacing it with textarea
  let originalValue = dataCell.textContent;

  // Add padding to the dataCell
  dataCell.style.padding = "5px";

  // Create a textarea element
  let textArea = document.createElement("textarea");
  textArea.className = "form-control";
  textArea.value = originalValue;

  // Add the textarea element into Cell
  dataCell.innerHTML = "";
  dataCell.appendChild(textArea);

  // Focus on the textarea element
  textArea.focus();

  // Flag to check if ESC key was pressed
  let escKeyPressed = false;

  // Function to handle changes and cleanup
  function finishEditing() {
    if (!escKeyPressed) {
      const value = textArea.value;
      dataCell.textContent = value;
      dataCell.style.padding = "";
      textArea.remove();

      if (value !== originalValue) {
        dataCell.textContent = value;
        handleValueChanged(value);
      } else {
        dataCell.textContent = originalValue;
      }
    } else {
      // Restore the original value and clean up
      dataCell.textContent = originalValue;
      dataCell.style.padding = "";
      textArea.remove();
    }
  }

  // Back to original when ESC key press
  textArea.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      escKeyPressed = true;
      textArea.blur(); // Trigger the 'blur' event
    }
  });

  // Finish editing on 'blur' event
  textArea.addEventListener("blur", function () {
    finishEditing();
  });
}

function editTag(dataCell) {
  let originalContent = dataCell.textContent;

  // Create a search input
  let searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "form-control mx-2";
  searchInput.style.textOverflow = "ellipsis";
  searchInput.style.setProperty("margin", "0", "important");
  searchInput.value = originalContent;
  let selectContainer = document.createElement("div");
  selectContainer.className = "list-container";

  createlayerList(layerList);

  function createlayerList(layerList) {
    layerList.forEach(function (option) {
      let listItem = document.createElement("div");
      listItem.className = "list";
      listItem.textContent = option;
      listItem.style.cursor = "pointer";

      selectContainer.appendChild(listItem);

      // Add click event to the list item to handle value change
      listItem.addEventListener("click", function () {
        selectContainer.value = option;
        handleValueChanged(option);
      });
    });
  }

  // Function to filter options based on search input value and show the select container
  function showlayerList() {
    let searchTerm = searchInput.value.trim().toLowerCase();
    let filteredOptions = layerList.filter(function (option) {
      return option.toLowerCase().includes(searchTerm);
    });
    // Clear current content of the container
    selectContainer.innerHTML = "";
    // Create list based on user search 
    createlayerList(filteredOptions);
  }

  // Add "input" event listener to the search input
  searchInput.addEventListener("input", function () {
    showlayerList();
  });

  // Clear current content of data cell
  dataCell.innerHTML = "";
  dataCell.style.padding = "5px";
  dataCell.appendChild(searchInput);
  dataCell.appendChild(selectContainer);
  selectContainer.style.width = searchInput.clientWidth;

  // Function to handle global click event and close the select container
  function handleGlobalClick(event) {
    let clickedElement = event.target;
    if (
      clickedElement !== dataCell &&
      !dataCell.contains(clickedElement) &&
      clickedElement !== searchInput
    ) {
      document.removeEventListener("click", handleGlobalClick);
      selectContainer.style.display = "none";
      dataCell.textContent = originalContent;
      dataCell.style.padding = "";
    }
  }

  // Attach a one-time click event listener to the document
  document.addEventListener("click", handleGlobalClick);

  // Prevent the click event from bubbling up to the document
  searchInput.addEventListener("click", function (event) {
    event.stopPropagation();
  });

  // Prevent the document click event from being triggered immediately
  searchInput.addEventListener("mouseup", function (event) {
    event.preventDefault();
  });
}

function editCustom(dataCell) {
  let originalHtml = dataCell.innerHTML;
  let originalContent = dataCell.textContent;

  // Create a search input
  let searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "form-control mx-2";
  searchInput.style.textOverflow = "ellipsis";
  searchInput.style.setProperty("margin", "0", "important");
  searchInput.value = originalContent;

  let selectContainer = document.createElement("div");
  selectContainer.className = "list-container";

  createDynamicList(dynamicList);

  function createDynamicList(list) {
    list.forEach(function (option) {
      let listItem = document.createElement("div");
      listItem.className = "list";
      listItem.style.cursor = "pointer";
      let spanElement = document.createElement("span");
      spanElement.textContent = option;

      if (
        option === "Name" ||
        option === "Summary" ||
        option === "Description" ||
        option === "Item Code"
      ) {
        spanElement.className = "badge badge-pill badge-primary";
      } else {
        spanElement.className = "badge badge-pill badge-dark";
      };

      listItem.appendChild(spanElement);

      selectContainer.appendChild(listItem);

      // Add click event to the list item to handle value change
      listItem.addEventListener("click", function () {
        selectContainer.value = option;
        console.log("Custom key selected and sent to SketchUp: ", option);
        sketchup.savedCustomKey(option);
      });
    });
  };

  // Function to filter options based on search input value and show the select container
  function showDynamicList() {
    let searchTerm = searchInput.value.trim().toLowerCase();
    let filteredOptions = dynamicList.filter(function (option) {
      return option.toLowerCase().includes(searchTerm);
    });
    // Clear current content of the container
    selectContainer.innerHTML = "";
    // Create list based on user search 
    createDynamicList(filteredOptions);
  }

  // Add "input" event listener to the search input
  searchInput.addEventListener("input", function () {
    showDynamicList();
  });

  dataCell.innerHTML = "";
  dataCell.style.padding = "5px";
  dataCell.appendChild(searchInput);
  dataCell.appendChild(selectContainer);
  selectContainer.style.width = searchInput.clientWidth;

  // Function to handle global click event and close the select container
  function handleGlobalClick(event) {
    let clickedElement = event.target;
    if (
      clickedElement !== dataCell &&
      !dataCell.contains(clickedElement) &&
      clickedElement !== searchInput
    ) {
      document.removeEventListener("click", handleGlobalClick);
      selectContainer.style.display = "none";
      dataCell.innerHTML = originalHtml;
      dataCell.style.padding = "";
    }
  }

  // Attach a one-time click event listener to the document
  document.addEventListener("click", handleGlobalClick);

  // Prevent the click event from bubbling up to the document
  searchInput.addEventListener("click", function (event) {
    event.stopPropagation();
  });

  // Prevent the document click event from being triggered immediately
  searchInput.addEventListener("mouseup", function (event) {
    event.preventDefault();
  });
}

function editStatus(dataCell) {
  // Save current data
  let originalHtml = dataCell.innerHTML;
  let originalContent = dataCell.textContent;

  // Add padding to the dataCell  
  dataCell.style.padding = "5px";

  // Create an input element
  let searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "form-control mx-2";
  searchInput.style.textOverflow = "ellipsis";
  searchInput.style.setProperty("margin", "0", "important");
  searchInput.value = originalContent;
  let selectContainer = document.createElement("div");
  selectContainer.className = "list-container";

  statusList = ["new", "existing", "reuse", "temporary", "demolition"];
  createStatusList(statusList);

  function createStatusList(statusList) {
    statusList.forEach(function (option) {
      let listItem = document.createElement("div");
      listItem.className = "list";
      listItem.style.cursor = "pointer";
      let spanElement = document.createElement("span");
      spanElement.textContent = option;
      spanElement.setAttribute("data-translate", option);
      if (option === "new") {
        spanElement.className = "badge badge-primary";
      } else if (option === "existing") {
        spanElement.className = "badge badge-warning";
      } else if (option === "reuse") {
        spanElement.className = "badge badge-success";
      } else if (option === "temporary") {
        spanElement.className = "badge badge-tertiary";
      } else if (option === "demolition") {
        spanElement.className = "badge badge-danger";
      }

      listItem.appendChild(spanElement);
      selectContainer.appendChild(listItem);

      // Add click event to the list item to handle value change
      listItem.addEventListener("click", function () {
        selectContainer.value = spanElement.textContent;
        handleValueChanged(spanElement.textContent);
      });
    });
  }

  // Function to filter options based on search input value and show the select container
  function showStatusList() {
    let searchTerm = searchInput.value.trim().toLowerCase();
    let filteredOptions = statusList.filter(function (option) {
      return option.toLowerCase().includes(searchTerm);
    });
    // Clear current content of the container
    selectContainer.innerHTML = "";
    // Create list based on user search
    createStatusList(filteredOptions);
  }

  // Add "input" event listener to the search input
  searchInput.addEventListener("input", function () {
    showStatusList();
  });

  dataCell.innerHTML = "";
  dataCell.style.padding = "5px";
  dataCell.appendChild(searchInput);
  dataCell.appendChild(selectContainer);
  selectContainer.style.width = searchInput.clientWidth;

  // Function to handle global click event and close the select container
  function handleGlobalClick(event) {
    let clickedElement = event.target;
    if (
      clickedElement !== dataCell &&
      !dataCell.contains(clickedElement) &&
      clickedElement !== searchInput
    ) {
      document.removeEventListener("click", handleGlobalClick);
      selectContainer.style.display = "none";
      dataCell.innerHTML = originalHtml;
      dataCell.style.padding = "";
    }
  }

  // Attach a one-time click event listener to the document
  document.addEventListener("click", handleGlobalClick);

  // Prevent the click event from bubbling up to the document
  searchInput.addEventListener("click", function (event) {
    event.stopPropagation();
  });

  // Prevent the document click event from being triggered immediately
  searchInput.addEventListener("mouseup", function (event) {
    event.preventDefault();
  });

  // Focus on the select element
  selectContainer.focus();

  // Flag to check if ESC key was pressed
  let escKeyPressed = false;

  // Function to handle changes and cleanup
  function finishEditing() {
    if (!escKeyPressed) {
      const value = searchInput.value;
      dataCell.textContent = value;
      if (value !== originalContent) {
        dataCell.textContent = value;
        handleValueChanged(value);
      } else {
        dataCell.textContent = originalContent;
      }
    }
    dataCell.style.padding = "";
    searchInput.remove();
    selectContainer.remove();
  }

  // Back to original when ESC key press
  searchInput.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      escKeyPressed = true;
      searchInput.blur(); // Trigger the 'blur' event
    }
  });

  // Finish editing on 'blur' event
  searchInput.addEventListener("blur", function () {
    finishEditing();
  });

  currentLanguage = localStorage.getItem("language") || "pt";
  loadLanguage(currentLanguage);
}

function editImage(dataCell) {
  // Save current url of image by text only (not inclued HTML elements)
  let imgElement = dataCell.querySelector("img");
  let originalValue = imgElement.src;
  customLog("Orignal value: ", originalValue);

  // Add padding to the dataCell
  dataCell.style.padding = "5px";

  // Create an input element
  let inputElement = document.createElement("input");
  inputElement.className = "form-control mt-2";
  inputElement.type = "text";
  inputElement.placeholder = "Paste image link here";
  inputElement.value = originalValue;

  // Add the input element into Cell
  dataCell.appendChild(inputElement);

  // Focus on the input element
  inputElement.focus();

  // Add "click" event listener to select all text in the input
  inputElement.addEventListener("click", function () {
    inputElement.select();
  });

  // Flag to check if ESC key was pressed
  let escKeyPressed = false;

  // Function to handle changes and cleanup
  function finishEditing() {
    if (!escKeyPressed) {
      const value = inputElement.value;
      imgElement.src = value;
      dataCell.style.padding = "";
      inputElement.remove();

      if (value !== originalValue) {
        imgElement.src = value;
        handleValueChanged(value);
      } else {
        imgElement.src = originalValue;
      }
    } else {
      // Restore the original value and clean up
      imgElement.src = originalValue;
      dataCell.style.padding = "";
      inputElement.remove();

      // Wait for the image to load
      imgElement.onload = function () {
        let imgHeight = imgElement.naturalHeight;
        let imgWidth = imgElement.naturalWidth;
        imgElement.height = 128;
        imgElement.width = (imgWidth / imgHeight) * imgElement.height;
      };
    }

  }

  // Back to original when ESC key press
  inputElement.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      escKeyPressed = true;
      inputElement.blur(); // Trigger the 'blur' event
    }
  });

  // Finish editing on 'blur' event
  inputElement.addEventListener("blur", function () {
    finishEditing();
  });
}

function editSum(dataCell) {
  let originalHtml = dataCell.innerHTML;
  let originalContent = dataCell.textContent;

  // Create a search input
  let searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "form-control mx-2";
  searchInput.style.textOverflow = "ellipsis";
  searchInput.style.setProperty("margin", "0", "important");
  searchInput.value = originalContent;
  let selectContainer = document.createElement("div");
  selectContainer.className = "list-container";

  createSumList(sumList);

  function createSumList(sumList) {
    sumList.forEach(function (option) {
      let listItem = document.createElement("div");
      listItem.className = "list";
      listItem.setAttribute("data-translate", option);
      listItem.textContent = option;
      listItem.style.cursor = "pointer";

      selectContainer.appendChild(listItem);

      // Add click event to the list item to handle value change
      listItem.addEventListener("click", function () {
        selectContainer.value = option;
        console.log("User select: ", option);
        sumKey = option;
        localStorage.setItem("sumKey", sumKey);
      });
    });
  };

  // Function to filter options based on search input value and show the select container
  function showSumList() {
    let searchTerm = searchInput.value.trim().toLowerCase();
    let filteredOptions = sumList.filter(function (option) {
      return option.toLowerCase().includes(searchTerm);
    });
    // Clear current content of the container
    selectContainer.innerHTML = "";
    // Create list based on user search 
    createSumList(filteredOptions);
  }

  // Add "input" event listener to the search input
  searchInput.addEventListener("input", function () {
    showSumList();
  });

  // Clear current content of data cell
  dataCell.innerHTML = "";
  dataCell.style.padding = "5px";
  dataCell.appendChild(searchInput);
  dataCell.appendChild(selectContainer);
  selectContainer.style.width = searchInput.clientWidth;

  // Function to handle global click event and close the select container
  function handleGlobalClick(event) {
    let clickedElement = event.target;
    if (
      clickedElement !== dataCell &&
      !dataCell.contains(clickedElement) &&
      clickedElement !== searchInput
    ) {
      document.removeEventListener("click", handleGlobalClick);
      selectContainer.style.display = "none";
      dataCell.innerHTML = originalHtml;
      dataCell.style.padding = "";
    }
  }

  // Attach a one-time click event listener to the document
  document.addEventListener("click", handleGlobalClick);

  // Prevent the click event from bubbling up to the document
  searchInput.addEventListener("click", function (event) {
    event.stopPropagation();
  });

  // Prevent the document click event from being triggered immediately
  searchInput.addEventListener("mouseup", function (event) {
    event.preventDefault();
  });

  // Focus on the select element
  selectContainer.focus();

  // Flag to check if ESC key was pressed
  let escKeyPressed = false;

  // Function to handle changes and cleanup
  function finishEditing() {
    if (!escKeyPressed) {
      const value = searchInput.value;
      dataCell.textContent = value;
      if (value !== originalContent) {
        dataCell.textContent = value;
        // handleValueChanged(value);
      } else {
        dataCell.textContent = originalContent;
      }
    }
    dataCell.style.padding = "";
    searchInput.remove();
    selectContainer.remove();
  }

  // Back to original when ESC key press
  searchInput.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      escKeyPressed = true;
      searchInput.blur(); // Trigger the 'blur' event
    }
  });

  // Finish editing on 'blur' event
  searchInput.addEventListener("blur", function () {
    finishEditing();
  });

  // currentLanguage = localStorage.getItem("language") || "pt";
  // loadLanguage(currentLanguage);
}

// EDIT CELL BY DOUBLE CLICK
document.addEventListener('dblclick', function (event) {
  if (window.relatorioGroupedMode) { return; }
  const e = event.target;
  if (e.tagName !== "INPUT") {
    if (e.tagName === "TH") {
      editHeaderCell(e);
    } else {
      if (e.id.includes("extra")) {
        if (e.id === "extra_custom") {
          if (dynamicList.length != 0) {
            editCustom(e);
          } else {
            $("#noticeDynamicModal").modal("show");
          }
        } else {
          $("#noticeEditableModal").modal("show");
        }
      } else if (e.id.includes("sum")) {
        if (e.id === "sum-select") {
          editSum(e);
        } else {
          $("#noticeEditableModal").modal("show");
        }
      } else {
        if (e.tagName === 'IMG' || e.tagName === 'SPAN') {
          cell = e.closest('td');
        } else {
          cell = e;
        }
        getObjectID(cell);
        if (object_type === "group" && (
          key === "image" ||
          key === "price" ||
          key === "size" ||
          key === "url" ||
          key === "owner" ||
          key === "status"
        )) {
          $("#noticeGCModal").modal("show");
        } else if (
          key.includes("ordinal") ||
          key.includes("entity") ||
          key.includes("len") ||
          key.includes("area") ||
          key.includes("volume") ||
          key.includes("ifc") ||
          key.includes("quantity") ||
          key.includes("total") ||
          key.includes("custom")
        ) {
          $("#noticeEditableModal").modal("show");
        } else {
          if (
            key === "definition" ||
            key === "price" ||
            key === "size" ||
            key === "url"
          ) {
            editCell(cell);
          } else if (
            key === "instance" ||
            key === "description" ||
            key === "owner"
          ) {
            editTextArea(cell);
          } else if (key === "tag") {
            editTag(cell);
          } else if (key === "image") {
            editImage(cell);
          } else if (key === "status") {
            editStatus(cell);
          };
        }
      }
    }
  }
});

function getObjectID(cell) {
  cell_info = cell.id.split("-");

  object_id = cell_info[0];
  // customLog("1a. (Edit Cell) Object ID: ", object_id);

  object_type = cell_info[1];
  // customLog("1b. (Edit Cell) Object ID: ",  object_type);

  key = cell_info[2];
  // customLog("1c. (Edit Cell) Column key: ", key)
}

function handleValueChanged(value) {
  customLog("2. (Edit Cell) New value: ", value);
  sketchup.changeValue(object_id, key, value);
}

function sortDataByColumn(sortColumn, sortOrder) {
  if (window.relatorioGroupedMode) { return; }
  let decimalSeparator = localStorage.getItem('decimalSeparator') || '.';
  let thousandSeparator = localStorage.getItem('thousandSeparator') || ',';

  let table = document.getElementById("myTable");
  let tbody = table.querySelector("tbody");
  let rows = Array.from(tbody.getElementsByTagName("tr"));
  let textA;
  let textB;

  // Get data from clicked column
  let sortedRows = rows.sort(function (a, b) {
    let cellA = a.querySelector(`td[id$="-${sortColumn}"]`);
    let cellB = b.querySelector(`td[id$="-${sortColumn}"]`);

    if (sortColumn.includes("len") || sortColumn.includes("area") || sortColumn.includes("volume")) {
      textA = removeThousandSeparator(cellA.textContent || cellA.innerText, thousandSeparator);
      textB = removeThousandSeparator(cellB.textContent || cellB.innerText, thousandSeparator);
    } else {
      textA = cellA.textContent || cellA.innerText;
      textB = cellB.textContent || cellB.innerText;
    }

    // Order based on sortOrder
    let compareResult = textA.localeCompare(textB, undefined, { numeric: true });
    return compareResult * sortOrder;
  });

  function removeThousandSeparator(numberString, thousandSeparator) {
    return numberString.replace(new RegExp(`\\${thousandSeparator}`, 'g'), '');
  }

  localStorage.setItem("sortOrderSaved", sortOrder);
  customLog("2. (Sort) Sort order saved: ", sortOrder);

  // Remove old rows
  while (tbody.firstChild) {
    tbody.removeChild(tbody.firstChild);
  }

  // Add sorted rows to table body
  sortedRows.forEach(function (row) {
    tbody.appendChild(row);
  });

  updateIndex();
  if (typeof renderSumRow === 'function') { renderSumRow(); }
  customLog("(*) Index updated");
}

// SEARCH
function performSearch() {
  if (window.relatorioGroupedMode) {
    let findValue = document.getElementById("findInput").value;
    let table = document.getElementById("myTable");
    let groupRowsOnly = table.querySelectorAll('tbody tr[data-group-row="1"]');

    groupRowsOnly.forEach(function (row) {
      row.style.display = row.innerText.includes(findValue) ? "" : "none";
      const groupId = row.getAttribute('data-row-id');
      const detail = table.querySelector('tr[data-group-detail-for="' + groupId + '"]');
      if (detail && row.style.display === "none") {
        detail.style.display = "none";
      }
    });

    if (typeof renderSumRow === 'function') { renderSumRow(); }
    return;
  }

  let findInput = document.getElementById("findInput").value;
  let table = document.getElementById("myTable");
  let rows = table.getElementsByTagName("tr");
  let originalContent;

  for (let i = 2; i < rows.length; i++) { // i = 2 => (from row index 2)
    let row = rows[i];
    let cells = row.getElementsByTagName("td");
    let rowVisible = false;

    for (let j = 1; j < cells.length; j++) { // j = 1 (from row index 1)
      let cell = cells[j];
      getObjectID(cell);

      // Only action if the cell is not belong to Hidden column
      if (cell.style.display !== "none") {

        // Only Action if the cell not belong to column Image
        if (key !== "image") {
          let cellText = cell.textContent;

          // Save original content
          originalContent = cellText;

          // Check if the cell text contains the search input
          if (cellText.includes(findInput)) {
            rowVisible = true;

            // Highlight matching words in the cell
            let regex = new RegExp("(" + escapeRegExp(findInput) + ")", "gi");
            cellText = cellText.replace(regex, "<span class='search-highlight'>$1</span>");
            cell.innerHTML = cellText;
          } else {
            // If can't find matching words, back to origin content
            cell.innerHTML = originalContent;
          }
        }
      }
    }

    if (rowVisible) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }
  }
  groupRows();
  if (typeof renderSumRow === 'function') { renderSumRow(); }
}

// This function to prevent error when search with special characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

document.getElementById("findInput").addEventListener("keyup", function () {
  if (typeof window.setLayoutView === 'function') {
    window.setLayoutView('table');
  }
  performSearch();
});

let findInput = document.getElementById("findInput");
let findIcon = document.getElementById("findIcon");
let clearIcon = document.getElementById("clearIcon");
let replaceBox = document.getElementById("replaceBox");

findInput.addEventListener("input", function () {
  if (typeof window.setLayoutView === 'function') {
    window.setLayoutView('table');
  }
  performSearch();
  toggleClearIcon(); // Toggle the clear icon based on input value
});

clearIcon.addEventListener("click", function () {
  findInput.value = ""; // Clear the input value
  performSearch();
  toggleClearIcon(); // Hide the clear icon
});

function toggleClearIcon() {
  if (findInput.value.trim() !== "") {
    findIcon.style.display = "none";
    clearIcon.style.display = "block";
    replaceBox.style.display = "block";
  } else {
    findIcon.style.display = "";
    clearIcon.style.display = "none";
    replaceBox.style.display = "none";
  }
}

// REPLACE
function performReplace() {
  let findInput = document.getElementById("findInput").value;
  let replaceInput = document.getElementById("replaceInput").value;
  let table = document.getElementById("myTable");
  let rows = table.getElementsByTagName("tr");

  for (let i = 2; i < rows.length; i++) {
    let row = rows[i];
    let cells = row.getElementsByTagName("td");
    let rowVisible = false;

    // Only action if the row is not hidden
    if (row.style.display !== "none") {
      for (let j = 0; j < cells.length; j++) {
        let cell = cells[j];
        getObjectID(cell);

        // Only action if the cell is not belong to Hidden column
        if (cell.style.display !== "none") {
          let cellText = cell.textContent;

          // Check if the cell text contains the search input
          if (cellText.includes(findInput)) {
            // Replace the search input with the replace input
            let replacedText = cellText.replace(new RegExp(findInput, 'gi'), replaceInput);
            getObjectID(cell);
            if (
              key === "definition" ||
              key === "instance" ||
              key === "description" ||
              key === "price" ||
              key === "size" ||
              key === "url" ||
              key === "owner" ||
              key === "status"
            ) {
              customLog("Data Column replaced: ", key);
              customLog("ID Cell replaced: ", object_id);
              handleValueChanged(replacedText);
              rowVisible = true;
            }
          }

        }
      }
    }

    if (rowVisible) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }
  }
}

// Watch mouse click outside search/replace input
document.addEventListener("click", function (event) {
  let findInput = document.getElementById("findInput");
  let replaceInput = document.getElementById("replaceInput");
  let table = document.getElementById("myTable");

  // Check if clicked element is the search/replace input or belongs to the table
  if (
    event.target !== findInput &&
    event.target !== replaceInput &&
    !table.contains(event.target)
  ) {
    // Remove highlight when click outside the search input, replace input, and the table
    let cells = table.getElementsByTagName("td");
    for (let i = 0; i < cells.length; i++) {
      let cell = cells[i];
      let cellText = cell.innerHTML;
      // Save original content
      let originalContent = cellText;
      cell.innerHTML = originalContent;
    }
  }
});

// Handle event click to "arrow_next" for Search & Replace
document.getElementById("replaceIcon").addEventListener("click", function () {
  performSearch();
  performReplace();
});

// GROUP SAME ROWS
function groupRows() {
  if (window.relatorioGroupedMode) {
    updateIndex();
    return;
  }

  customLog("(*) Group same rows start now");
  let table = document.getElementById('myTable');
  let rows = table.getElementsByTagName('tr');
  let groupedRows = {};

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Skip rows with id = "extraRow"
    if (row.id === "extra") {
      continue;
    }

    const cells = row.getElementsByTagName('td');
    let key = '';

    for (let j = 1; j < cells.length - 1; j++) {
      key += cells[j].innerText;
    }

    if (!groupedRows[key]) {
      groupedRows[key] = { count: 0, rows: [] };
    }

    groupedRows[key].count++;
    groupedRows[key].rows.push(row);
  }

  // Hide existing rows (except the first row in each group)
  for (const key in groupedRows) {
    const rowsToHide = groupedRows[key].rows.slice(1);
    rowsToHide.forEach(row => {
      row.style.display = "none";
    });

    // Update value for the last cell in the first row of the group
    const firstRow = groupedRows[key].rows[0];
    const allCells = firstRow.getElementsByTagName('td');

    // Exclude Sum cells
    const cells = Array.from(allCells).filter(cell => !cell.id.includes("sum"));

    const lastCellIndex = cells.length - 2;
    cells[lastCellIndex].innerText = groupedRows[key].count;
  }
  updateIndex();
}

// Update ordinal values in the index column
function updateIndex() {
  var table = document.getElementById('myTable');
  const ordinalColumnIndex = getColumnIndexByKey(table, "ordinal");
  const tbody = table.querySelector("tbody");
  const visibleRows = Array.from(tbody.getElementsByTagName("tr")).filter(function (row) {
    if (row.style.display === "none") { return false; }
    if (window.relatorioGroupedMode) {
      return row.getAttribute('data-group-row') === '1';
    }
    return true;
  });

  visibleRows.forEach((row, index) => {
    const cells = row.getElementsByTagName("td");
    if (ordinalColumnIndex !== -1 && cells.length > ordinalColumnIndex) {
      cells[ordinalColumnIndex].innerText = index + 1;
    }
  });
}

// Update the data in the "extra" row
function updateExtraRow(value) {
  customLog("1. (Extra Update) Update Extra Row received value: ", value)
  var cell = document.getElementById("extra_price");
  cell.innerHTML = "";
  let spanElement = document.createElement("span");
  spanElement.className = "badge badge-pill badge-primary";
  spanElement.textContent = value;
  cell.appendChild(spanElement);
};
