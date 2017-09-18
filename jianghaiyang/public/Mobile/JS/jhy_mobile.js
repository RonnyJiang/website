/**
 * Created by ronny on 17-9-12.
 */



// ========选择搜索引擎事件(根据选择修改对应的action和input（type=text）下的name属性值) ===start=============
function selectSearch(Sobject) {
    console.log(Sobject.selectedIndex);
    console.log(Sobject.toString());
    console.log(Sobject.options[Sobject.selectedIndex].value);
    console.log(Sobject.options[Sobject.selectedIndex].text);
    if (Sobject.options[Sobject.selectedIndex].value=="google"){
        document.getElementById("from_search").setAttribute("action","https://www.google.com/search");
        document.getElementById("searchinput").setAttribute("name","q");
        console.log("修改成google的name 和action");
    } else if (Sobject.options[Sobject.selectedIndex].value=="baidu"){
        document.getElementById("from_search").setAttribute("action","https://www.baidu.com/baidu");
        document.getElementById("searchinput").setAttribute("name","word");
        console.log("修改成baidu的name 和action");
    } else if (Sobject.options[Sobject.selectedIndex].value=="mywebsite"){
        console.log("修改成站内的name 和action");
    }
}

// ========选择搜索引擎 ===end=============

// ========PC and Mobile switch ===start=============

function pc_to_mobile() {
    document.cookie = 'gotopc=false';
    location.reload();
}

function mobile_to_pc() {
    document.cookie = 'gotopc=true';
    location.reload();
}

// ========PC and Mobile switch ===end=============