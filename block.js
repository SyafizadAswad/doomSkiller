// block.js
// Load and display to-do list on the block page

chrome.storage.sync.get("todoList", (data) => {
  const todos = data.todoList || [];
  const todoSection = document.getElementById("todoSection");
  const todoList = document.getElementById("todoList");
  
  if (todos.length > 0) {
    todoSection.style.display = "block";
    todoList.innerHTML = "";
    todos.forEach((todo) => {
      const li = document.createElement("li");
      li.className = "todo-item";
      li.textContent = todo;
      todoList.appendChild(li);
    });
  } else {
    todoSection.style.display = "none";
  }
});
