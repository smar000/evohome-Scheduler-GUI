//"use strict";
const ZONEVIEW = "zoneview"; //This schedules for a selected zone - i.e. weekly view of that zone 
const DAYVIEW = "dayview"; //This shows workingSchedule for ALL zones, but for a given selected day

var now = (new Date);
var timenow = now.getHours() + (now.getMinutes()/60);
// var jsDays = {0:'sun',1:'mon',2:'tue',3:'wed',4:'thu',5:'fri',6:'sat',7:'sun'};
var jsDays = ['sun','mon','tue','wed','thu','fri','sat']; //week starts on sun
var evoDays = ['mon','tue','wed','thu','fri','sat','sun']; //{0:'mon',1:'tue',2:'wed',3:'thu',4:'fri',5:'sat',6:'sun'}; //note week starts on monday in evohome schedules
var evoDayNames = ["Monday", "Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
var today = jsDays[now.getDay()];

// Base url
const HOST_URL_BASE = location.protocol.concat("//").concat(window.location.host);
//console.log("Host: ", HOST_URL_BASE);

//=================================================
// DATA
//=================================================
var nodes = {};
var room_temperature = 0;
var setpoint = 18.0;

var heating = {
    state: 0,
    manualsetpoint: 18,
    mode: 'manual'
};

var workingSchedule={};        //This is the full schedule but in the format as used by the sliders code adapted in this script
var evoschedule={};         //This is the evohome schedule as obtained from watchforstock's python client
var zones={};               //Zones found in the evoschedule
var screenSchedule = {};          //Part of schedule currently visble on screen

var tickers = [
    {start:0, end:3, setpoint:0},
    {start:3, end:6, setpoint:0},
    {start:6, end:9, setpoint:0},
    {start:9, end:12, setpoint:0},
    {start:12, end:15, setpoint:0},
    {start:15, end:18, setpoint:0},
    {start:18, end:21, setpoint:0},
    {start:21, end:24, setpoint:0}
];
var ticks={}; 
ticks['timeline'] = JSON.parse(JSON.stringify(tickers));

var maxc = 28;
var minc = 5;
// ================================================
// State variables
// ================================================

var modified = false;
var unsavedChanges = false;
var editmode = 'move';
var viewmode = ZONEVIEW;
var currentFilter ="";
var key = 1;
var day = ""; //"mon";
var mousedown = 0;
var slider_width = $(".slider").width();
var slider_height = $(".slider").height();
var changed = 0;

// ================================================

$('[title!=""]').qtip(); //take over tooltips

$("#mode-move").css("background-color","#ff9600");
$("#mode-zoneview").css("background-color","#ff9600");

intialise();

if (Object.keys(workingSchedule).length >0 ) {
    $('select>option:eq(1)').attr('selected', true);
    screenSchedule = workingSchedule[Object.keys(workingSchedule)[0]];
    drawSchedule();
}

//Event handlers ---------------------------------------------
$("#mode-zoneview").click(function(){
    // console.log("zoneview clicked");
    if (modified) stashCurrentChanges();
    $("#mode-move").click();
    $("#mode-zoneview").css("background-color","#ff9600");
    $("#mode-dayview").css("background-color","#555");
    viewmode = ZONEVIEW;
    populateDisplayFilter();
    
});

$("#mode-dayview").click(function(){
    // console.log("dayview clicked");
    if (modified) stashCurrentChanges();
    $("#mode-move").click();

    $("#mode-zoneview").css("background-color","#555");
    $("#mode-dayview").css("background-color","#ff9600");
    viewmode = DAYVIEW;
    
    populateDisplayFilter();
});

// Zone/Day View dropdown change event

$("#displayFilter").on('focus', function(){
	// console.log("Modified status: ", modified, ". Current filter value: '", this.value,"'");
	if (modified) stashCurrentChanges();
}).change(function(){
    // Rebuild screenSchedule to hold just the elements from workingSchedule that needs to be shown on screen.
    if (viewmode == ZONEVIEW){
        initZoneView();
        if (this.value == "_undefined") 
            {screenSchedule={};}
        else {
            screenSchedule = workingSchedule[this.value]; 
        }
    } else {
        initDayView();
        if (this.value == "_undefined") 
            {screenSchedule={};  } //
        else  // As we are in DAYVIEW, we need to build 'screenSchedule' by getting the relevant day's info for each zone
            {
                screenSchedule = {}
                for (zoneId in zones) {
                    screenSchedule[zoneId] = workingSchedule[zoneId][this.value];
                };
            }

    }
    currentFilter = this.value;
    
    drawSchedule();
    currentFilter
});

// Copy radio/checkbox button clicked
$('#sliders-container').on('click','.chk-day', function(e){
    // console.log("radio clicked", this);
    // console.log(this.firstChild.value, this.firstChild.type, this.firstChild.id);
    day = this.firstChild.value; //set global var to currently selected row
    var id = this.firstChild.id;

    if (this.firstChild.type =="radio") { //radio button clicked
        var radio = $('input[name="chk-copy"]'); 
        radio.each(function() { //Change all non-checked radios into checkboxes
            if (this.id != id) this.type="checkbox";
        });
        $('#copy-cancel').text("Cancel");     
        $('#copy-cancel').css("display","inline");
    } else { // checkbox clicked - get all selected
        var chk = $('input[name="chk-copy"]'); 
        var checkedValues = $('input:checkbox:checked').map(function() {
            return this.value;
        }).get();
        if (checkedValues.length>0) {
            $("#copy-rows").css("display","inline");
        } else
            $("#copy-rows").css("display", "none");
        // console.log('Checkboxes selected: ',checkedValues.toString(), "day: ", day);
    }
});

$("body").on("mousedown",".slider-button", function(e){mousedown = 1; key=$(this).attr('key');});

$("body").mouseup(function(e){
    mousedown = 0;
    if (changed) {
        // TODO... SAVE???
        changed = 0;
    }
});

$("body").on("mousemove",".slider", function(e){ //dragging of slider
    // console.log("mouse move: editmode",editmode); 
    if (mousedown && editmode=='move') {
        day = $(this).attr('day');
        dragSlider(e);
    }
});

$("body").on("touchstart",".slider-button", function(e){mousedown = 1; key=$(this).attr('key');});

$("body").on("touchend","body",function(e){
    mousedown = 0;
    if (changed) {
        // TODO... SAVE???
        console.log("New screenSchedule: " + JSON.stringify(screenSchedule));
        changed = 0;
    }
});;

$("body").on("touchmove",".slider", function(e){ //dragging of slider    
    var event = window.event;
    e.pageX = event.touches[0].pageX;
    if (mousedown && editmode=='move') {
        day = $(this).attr('day');
        dragSlider(e);
    } 
});

// MERGE
$("body").on("click",".slider-button", function(){
    if (editmode=='merge') { // must have at least 1 setpoint in the day
        day = $(this).parent().attr("day");
        key = parseInt($(this).attr("key"));
        if (screenSchedule[day].length>2){
            screenSchedule[day][key-1].end = screenSchedule[day][key].end;
            screenSchedule[day].splice(key,1);
            drawRowSlider(day);            
        } 
    }
});

// row/slider clicked
$("body").on("click",".slider-segment", function(e){

    day = $(this).parent().attr("day");
    key = parseInt($(this).attr("key"));
    
    if (editmode=='split' && screenSchedule[day].length < 7) { //Evohome allows max of 6 setpoints in a day.
        var x = e.pageX - $(this).parent()[0].offsetLeft;
        var prc = x/slider_width;
        var hour = prc * 24.0;
        hour = Math.round(hour/0.5)*0.5;
        
        if (hour>screenSchedule[day][key].start+0.5 && hour<screenSchedule[day][key].end-0.5)         {
            var end = parseFloat(screenSchedule[day][key].end);
            screenSchedule[day][key].end = hour;
            
            screenSchedule[day].splice(key+1, 0, {
                start:hour, 
                end:end, 
                setpoint:screenSchedule[day][key].setpoint
            });
            
            drawRowSlider(day);
        }
    } else if (editmode=='move') {
        $("#slider-segment-temperature").val((screenSchedule[day][key].setpoint*1).toFixed(1));
        $("#slider-segment-start").val(getFormattedTime(screenSchedule[day][key].start));
        $("#slider-segment-end").val(getFormattedTime(screenSchedule[day][key].end));
        
        $("#slider-segment-block").show();
        $("#slider-segment-block-movepos").hide();
    }
});

// Cancel (Edit) clicked
$("body").on("click","#slider-segment-cancel", function(){
    $("#slider-segment-block").hide();
    
});

$("body").on("click","#slider-segment-movepos-cancel", function(){
    $("#slider-segment-block-movepos").hide();
    
});

// Ok button (after slot edit) clicked 
$("body").on("click","#slider-segment-ok", function(){
    bodyOKClicked();
});

// Trap enter key for 'slider-segment' edits
$("body").on('keydown', '.slider-segment', function(e) {  
    if(e.keyCode == 13)
    {
        e.preventDefault();
        // console.log($("Enter clicked. Value = " + $(this).text()));
        // $("#slider-segment-temperature").val((screenSchedule[day][key].setpoint*1).toFixed(1));
        bodyOKClicked($(this).text());
    }
});

//Segment edit lost focus
$("body").on('focusout', '.slider-segment', function(e){
    bodyOKClicked($(this).text());
});

$("#slider-segment-movepos-ok").click(function(){
    console.log("slider-segment-movepos-ok click event. day =",day, "key =", key);
    // console.log(screenSchedule);
    var time = getDecodedTime($("#slider-segment-time").val());
    if (time!=-1 && key>0) {
        if (time>=(screenSchedule[day][key-1].start+0.5) && time<=(screenSchedule[day][key].end-0.5)) {
            screenSchedule[day][key-1].end = time;
            screenSchedule[day][key].start = time;
        }
    }
    $("#slider-segment-time").val(getFormattedTime(screenSchedule[day][key].start));  
    redrawSlider(day,key);
    $("#slider-segment-block-movepos").hide();
    // save("app/heating/screenSchedule",JSON.stringify(screenSchedule));
});

$("body").on("click", function(){
    if ($("slider-segment-block-movepos").css("display") == "inline"){
        console.log("'body'.on click - Triggering slider-segment-movepos-ok click event", $("slider-segment-block-movepos").css("display") ); 
        $("#slider-segment-movepos-ok")[0].click();
    }
});

$("#mode-split").click(function(){
    editmode = 'split';
    $(".editmode").css("background-color","#555");
    $(this).css("background-color","#ff9600");
});

$("#mode-move").click(function(){
    editmode = 'move';
    $(".editmode").css("background-color","#555");
    $(this).css("background-color","#ff9600");
});

$("#mode-merge").click(function(){
    editmode = 'merge';
    $(".editmode").css("background-color","#555");
    $(this).css("background-color","#ff9600");
});

$("#btn-load").click(function(){
    if (modified || unsavedChanges){
        if (!confirm("There are unsaved changes which will be lost.\n\nAre you sure you want to re-load the schedule?")) return;
    }
    loadAllSchedules();	
    populateDisplayFilter();
});

// Copy button clicked
$("#copy-cancel").click(function(){
    if ($('#copy-cancel').text().toLowerCase().includes("cancel")) {
    cancelCopy();
    } else {
        
        if ($('.chk-day').css("display") == "none") 
        {
            $('.chk-day').css("display", "inline");
            $('#copy-cancel').text("Cancel");       
        } else {
            var selectedItem = $('input[name="chk-copy"]:checked');            
            // var day = selectedItem.val();
            var id = selectedItem.prop('id');
            // console.log("Radio with id ", id, " selected");

            if (selectedItem.val() != undefined) {
                var radio = $('input[name="chk-copy"]'); 
                radio.each(function() {
                    if (this.id != id){
                        this.type="checkbox";
                    } 
                });
                $('#copy-cancel').text("Cancel");               
            }
        }
    }
});

// Do copy button clicked
$("#copy-rows").click(function(){
    var sourceDay = $('input:radio:checked').val(); 
    var destDays = $('input:checkbox:checked').map(function() {
        return this.value;
    }).get();
    if (destDays.length>0) { 
        $("#copy-rows").css("display","inline");
    } else //nowhere to copy to...
        $("#copy-rows").css("display", "none");
    // console.log("Do Copy from '" + sourceDay + "' to '" + destDays.toString() + "'");
    
    if (screenSchedule != undefined){
        var sourceSched = screenSchedule[sourceDay];
        destDays.forEach(function(destDay){
            var newSched = screenSchedule[destDay]
            screenSchedule[destDay] = sourceSched;
        });
        cancelCopy();   //hide the copy related radios etc.
        drawSchedule();
        setModified();
        
    } else console.log("Copy failed: Schedule is undefined")
    
});

// Save the screenSchedule
$("#save-changes").click(function() {
save();
});

//  Functions ================================================
function drawSchedule()
{
    editmode = 'move';
    $("#mode-move").css("background-color","#ff9600");
    key = 1;
    // day = "mon";
    mousedown = 0;
    slider_width = $(".slider").width();
    slider_height = $(".slider").height();
    changed = 0;

    $(".zone-setpoint").html(setpoint.toFixed(1)+"&deg;C");
    // update();
    // updateclock();
    // setInterval(update, 5000);
    // setInterval(updateclock, 1000);
    
    drawRowSlider("timeline",ticks);
    // console.log(screenSchedule);
    if (typeof screenSchedule !== "undefined"){
        for (rowKey in screenSchedule) drawRowSlider(rowKey);
        // if (Object.keys(screenSchedule).length >0 ) day = console.log($(".sliders-container")[0].childNodes[0].childNodes[0].attributes["day"].value); else day ="";
    }
    // day = Object.keys(screenSchedule)[0]; //set initial
}

function initZoneView(){
    var daysList = ['mon','tue','wed','thu','fri','sat','sun'];
    var out = "";
    for (var i = 0; i < daysList.length; i++) {
        out += '<div class="slider-wrapper"><div class="slider" day="' + daysList[i] + '"></div><div class="chk-day"><input  type="radio" name="chk-copy" id="chk-' + 
                daysList[i] + '" value="' + daysList[i] + '" autocomplete="off"></div></div>\n';
    }        
    $(".sliders-container").html(out);
}

function initDayView(){
    var out = "";
    // console.log(zones);
    for (zoneId in zones) {
        // rowID=zone.zoneId//[i].replace(/\s/g,"_").replace(/\'/g,""); //.toLowerCase();
        out += '<div class="slider-wrapper"><div class="slider" day="' + zoneId + '"></div><div class="chk-day"><input  type="radio" name="chk-copy" id="chk-' + 
                zoneId + '" value="' + zoneId + '" autocomplete="off"></div></div>\n';
    };        
    // console.log("original: ", $(".sliders-container").html());
    // console.log("out:", out);

    $(".sliders-container").html(out);
}

function populateDisplayFilter(){
    $('#displayFilter').empty();

    if (viewmode == ZONEVIEW){
        // Populate from zones array 
        var option ='';
        for (zoneId in zones) {
            // option += '<option value="'+ zone + '">' + zone.replace(/_/g," ") + '</option>';
            option += '<option value="'+ zoneId + '">' + zones[zoneId].name + '</option>';   
        };
        $('#displayFilter').append(option);
    } else { //day view
        $('#displayFilter').append('<option value="mon">Monday</option>');
        $('#displayFilter').append('<option value="tue">Tuesday</option>');
        $('#displayFilter').append('<option value="wed">Wednesday</option>');
        $('#displayFilter').append('<option value="thu">Thursday</option>');
        $('#displayFilter').append('<option value="fri">Friday</option>');
        $('#displayFilter').append('<option value="sat">Saturday</option>');
        $('#displayFilter').append('<option value="sun">Sunday</option>');
        // $('#displayFilter').append(option);
    }
    if ($('#displayFilter').length >0){ //select first item as default if available
        if (viewmode == ZONEVIEW)
            $('select').prop('selectedIndex', 0);
        else {
            var day = now.getDay(); //This is Sunday = 0. we need to convert this to Monday based, as used by evohome
            if (day == 0) day = 6; else day -= 1;
            $('select').prop('selectedIndex', day);
            // console.log("populateDisplayFilter: Selection: " + ($('select').val()) + ", day: " + day);
        }
        $("#displayFilter").change();
    }

}

function updateclock()
{
    // return;
    if (viewmode == ZONEVIEW){
        now = (new Date);
        timenow = now.getHours() + (now.getMinutes()/60);
        today = jsDays[now.getDay()];
        
        $("#datetime").html(today.toUpperCase()+" "+getFormattedTime(timenow));
        
        var current_key = 0;
        for (z in screenSchedule[today])
        {
            if (screenSchedule[today][z].start<=timenow && screenSchedule[today][z].end>timenow) current_key = z;
        }
        
        // var sx = $(".slider[day="+today+"]")[0].offsetLeft;
        // var y = $(".slider[day="+today+"]")[0].offsetTop;
        // var x1 = sx + slider_width*(timenow/24.0);
        // var x2 = sx + slider_width*(screenSchedule[today][current_key].start/24.0);
        
        // var x2 = sx;
        // $("#timemarker").css('top',y+"px");
        // $("#timemarker").css('left',x2+"px");
        // $("#timemarker").css('width',(x1-x2)+"px");
    }
}

function bodyOKClicked(temperature){
    // console.log("body on click. editmode",editmode);
    if (temperature) $("#slider-segment-temperature").val(temperature);
    // console.log("#slider-segment-temperature.text = " + $("#slider-segment-temperature").val());
    updateSliderDetails(day,key);
    if (viewmode == ZONEVIEW && key == screenSchedule[day].length -1) {//We have just modfied last slot. Copy over to next morning in case SP has changed
        // console.log(day + " (" + jsDays.indexOf(day) + ") last slot edited...");
        var d = jsDays.indexOf(day);
        if (d == 6) d = 0; else d++; 
        updateSliderDetails(jsDays[d],0); //make sure we update the following day, after midnight slot
    }
    updateclock();

    $("#slider-segment-block").hide();
    $("#slider-segment-block-movepos").hide();
    setModified(true);
    // console.log("Schedule updated:",screenSchedule);

}

function cancelCopy(){
    // console.log("Cancel copy clicked");
    $('input[name="chk-day"]').removeAttr('checked');
    var radio = $('input[name="chk-copy"]'); 
        radio.each(function() { //revert all checkboxes back to radios, and uncheck
            this.type="radio";
            $(this).prop('checked', false);
        });
    // $('.chk-day').show();
    // $('.chk-day').css("display", "none");
    $('#copy-cancel').text("Copy");
    $('#copy-cancel').css("display","none");
    $("#copy-rows").css("display", "none");    //hide the button   
}

function drawRowSlider(rowID,localSchedule)
{
    var html = "";
    var slotKey = 0;
    localSchedule = localSchedule || screenSchedule; //default to global current view schedule if no local schedule passed - only using this to pass the ticks for the time strip 
    // var jsDays = {0:'sun',1:'mon',2:'tue',3:'wed',4:'thu',5:'fri',6:'sat',7:'sun'}; 
    //  console.log(localSchedule);
    if (viewmode == DAYVIEW) rowID = rowID.replace(/\s/g,"_").replace(/\'/g,""); //.toLowerCase();
    
    for (var z in localSchedule[rowID])
    {
        // console.log("row: " + z);
        var left = (localSchedule[rowID][z].start / 24.0) * 100;
        var width = ((localSchedule[rowID][z].end - localSchedule[rowID][z].start) / 24.0) * 100;
        var color = getColourForTemperature(localSchedule[rowID][z].setpoint);
        var startTime = getFormattedTime(localSchedule[rowID][z].start); //  hours + ":" + ("0" + mins).slice(-2);
        var endTime = getFormattedTime(localSchedule[rowID][z].end)
        var sp = localSchedule[rowID][z].setpoint;
        var tooltip = startTime + " - " + endTime 
        var timelineOverride ="" //css overrides for the timeline strip
        var timelineGripOverride ="" //css overrides for thee timeline strip
        var editable ="" //css overrides 

        if (rowID=="timeline") {
            sp =startTime;
            timelineOverride="text-align:left !important; box-shadow: 0 0 0px !important;"; //override alignment css for timeline tickers
            timelineGripOverride="border-left: 2px solid red; ";
            // if (slotKey == 0 ) timelineOverride += "border-left: 2px solid red !important; border-radius: 0px !important;  "; //First segement on timeline.            
            if (slotKey == 7 ) timelineOverride += "border-right: 2px solid red !important; border-radius: 0px !important;  "; //Last segement on timeline.            
            editable ="";
        }
        else {
            tooltip = localSchedule[rowID][z].setpoint + "&deg;C @ " + tooltip;
            editable = "contenteditable='true' "
        }

        // console.log(rowID, "-", slotKey," : Left: ", left, ", Width: ", width, " END: ", localSchedule[rowID][z].end);
        html += "<div class='slider-segment' " + editable +"style='" + timelineOverride + "left:"+left+"%; width:"+width+"%; background-color:"+color+"' key=" +
                slotKey +" title='" + tooltip + "'>" + sp + "</div>";

        if (slotKey>0) {
            html += "<div class='slider-button' style='"+ timelineGripOverride + "left:"+left+"%;' key="+slotKey+"></div>";
        } 
        slotKey++;
    }
    if (rowID!="timeline") { 
        var todayStyle = "";
        var today = jsDays[now.getDay()];
        if (rowID == today) todayStyle = " style='color: black;' "
        var text = rowID;
        if (viewmode == DAYVIEW) text = zones[rowID].name;
        html += "<div class='slider-label'" + todayStyle + ">"+text.toUpperCase()+"</div>";
    }
    // console.log("slider for '",rowID,"': ", $(".slider[day="+rowID+"]").html());
    $(".slider[day="+rowID+"]").html(html);
}

function updateSliderDetails(row, slotKey){
    sp = $("#slider-segment-temperature").val();   
    // console.log("sp=" + sp); 
    if (sp <5) sp = 5.0;
    screenSchedule[row][slotKey].setpoint = sp;    
    var color = getColourForTemperature(screenSchedule[row][slotKey].setpoint);
    $(".slider[day="+row+"]").find(".slider-segment[key="+slotKey+"]").css("background-color",color);
    $(".slider[day="+row+"]").find(".slider-segment[key="+slotKey+"]").text(screenSchedule[row][slotKey].setpoint);
    
    // var tooltip = screenSchedule[row][slotKey].setpoint + "&deg;C @ " + getFormattedTime(screenSchedule[row][slotKey].start) + " - " + getFormattedTime(screenSchedule[row][slotKey].end);
    // $(".slider[day="+row+"]").find(".slider-segment[key="+slotKey+"]").prop("title",tooltip);
    setToolTip(row,slotKey)

    var time = getDecodedTime($("#slider-segment-start").val());
    if (time!=-1 && slotKey>0 && slotKey<screenSchedule[row].length) {
        if (time>=(screenSchedule[row][slotKey-1].start+0.5) && time<=(screenSchedule[row][slotKey].end-0.5)) {
            screenSchedule[row][slotKey-1].end = time;
            screenSchedule[row][slotKey].start = time;
        }
    }
    $("#slider-segment-start").val(getFormattedTime(screenSchedule[row][slotKey].start));
    redrawSlider(row,slotKey);
    
    var time = getDecodedTime($("#slider-segment-end").val());
    if (time!=-1 && slotKey>0 && slotKey<(screenSchedule[row].length-1)) {
        if (time>=(screenSchedule[row][slotKey].start+0.1667) && time<=(screenSchedule[row][slotKey+1].end-0.1667)) {
            screenSchedule[row][slotKey].end = time;
            screenSchedule[row][slotKey+1].start = time;
        }
    }
    $("#slider-segment-end").val(getFormattedTime(screenSchedule[row][slotKey].end));
    redrawSlider(row,slotKey+1);
    

}

function dragSlider(e) //called after mouse or touch drag
{
    $("#slider-segment-block-movepos").show();
    $("#slider-segment-block").hide();
    
    // console.log("Slider update for key",key, "day", day, $(".slider[day="+day+"]"));
    if (key!=undefined) {
        // console.log("updateSliderForMouse: offsetLeft: ", $(".slider[day="+day+"]")[0].offsetParent.offsetLeft)
        var x = e.pageX - $(".slider[day="+day+"]")[0].offsetParent.offsetLeft;
        
        var prc = x/slider_width;
        var hour = prc * 24.0;
        hour = Math.round(hour/0.1667)*0.1667; //Evohome has 10 minute slots
        // console.log("Hour", hour, "prc", prc, "x", x, "e.pageX",e.pageX, "offsetLeft",$(".slider[day="+day+"]")[0].offsetLeft );
        // console.log(screenSchedule[day][key-1].start , screenSchedule[day][key].end);
        if (hour > screenSchedule[day][key-1].start && hour < screenSchedule[day][key].end)
        {
            screenSchedule[day][key-1].end = hour;
            screenSchedule[day][key].start = hour;
            setToolTip(day,key-1);
            redrawSlider(day,key);
            changed = 1;
            setModified(true);

        }
        $("#slider-segment-time").val(getFormattedTime(screenSchedule[day][key].start));
    }
            
}

function getColourForTemperature(temperature)
{
    // Use a wavelength to colour algorith as it seems to give a good representation for temperature
    // https://academo.org/demos/wavelength-to-colour-relationship/
    var Gamma = 0.80;
    var IntensityMax = 255;
    var factor;
    var wavelength = temperature*8 + 430;
    var r, g , b;

    if (temperature <=0 ) {
        r=239; g=245; b= 255;
    } else if((wavelength >= 380) && (wavelength<440)){
        r = -(wavelength - 440) / (440 - 380);
        g = 0.0;
        b = 1.0;
    }else if((wavelength >= 440) && (wavelength<490)){
        r = 0.0;
        g = (wavelength - 440) / (490 - 440);
        b = 1.0;
    }else if((wavelength >= 490) && (wavelength<510)){
        r = 0.0;
        g = 1.0;
        b = -(wavelength - 510) / (510 - 490);
    }else if((wavelength >= 510) && (wavelength<580)){
        r = (wavelength - 510) / (580 - 510);
        g = 1.0;
        b = 0.0;
    }else if((wavelength >= 580) && (wavelength<645)){
        r = 1.0;
        g = -(wavelength - 645) / (645 - 580);
        b = 0.0;
    }else if((wavelength >= 645) && (wavelength<781)){
        r = 1.0;
        g = 0.0;
        b = 0.0;
    }else{
        r = 0.0;
        g = 0.0;
        b = 0.0;
    };
    // Let the intensity fall off near the vision limits
    if((wavelength >= 380) && (wavelength<420)) factor = 0.3 + 0.7*(wavelength - 380) / (420 - 380);
    else if((wavelength >= 420) && (wavelength<701)) factor = 1.0;
    else if((wavelength >= 701) && (wavelength<781)) factor = 0.3 + 0.7*(780 - wavelength) / (780 - 700);
    else factor = 0.0;

    if (r !== 0) r = Math.round(IntensityMax * Math.pow(r * factor, Gamma));
    if (g !== 0) g = Math.round(IntensityMax * Math.pow(g * factor, Gamma));
    if (b !== 0) b = Math.round(IntensityMax * Math.pow(b * factor, Gamma));

    return "rgb("+r+","+g+","+b+")";
}

function redrawSlider(row,key)
{
    // console.log("update slider ui called. row/key:",row,key, screenSchedule[row], screenSchedule[row].length);

    if (screenSchedule[row]!=undefined && key<screenSchedule[row].length)
    {
        // console.log("updatesliderui: in If statement");

        var slider = $(".slider[day="+row+"]");
        if (key>0){
            var width = ((screenSchedule[row][key-1].end - screenSchedule[row][key-1].start) / 24.0) * 100;
            slider.find(".slider-segment[key="+(key-1)+"]").css("width",width+"%");
        }
        
        var left = (screenSchedule[row][key].start / 24.0) * 100;
        var width = ((screenSchedule[row][key].end - screenSchedule[row][key].start) / 24.0) * 100;
        slider.find(".slider-segment[key="+key+"]").css("width",width+"%");
        slider.find(".slider-segment[key="+key+"]").css("left",left+"%");
        slider.find(".slider-button[key="+key+"]").css("left",left+"%");         
        setToolTip(row,key);
    }
}

function setToolTip(row,key){
    var tooltip = screenSchedule[row][key].setpoint + "°C @ " + 
        getFormattedTime(screenSchedule[row][key].start) + " - " + 
        getFormattedTime(screenSchedule[row][key].end);
    
    $(".slider[day="+row+"]").find(".slider-segment[key="+key+"]").prop("title",tooltip);
}

function getFormattedTime(time){
    var hour = Math.floor(time);
    var mins = Math.round((time - hour)*60);
    if (mins<10) mins = "0" + mins;
    return hour+":"+mins;
}

function getDecodedTime(timestring){
    var time = -1;
    if (timestring.indexOf(":")!=-1) {
        var parts = timestring.split(":");
        var hour = parseInt(parts[0]);
        var mins = parseInt(parts[1]);
        
        if (mins>=0 && mins<60 && hour>=0 && hour<25) {
            if (hour==24 && mins!=0) { } else {
                time = hour + (mins/60);
            }
        }
    }
    return time;
}

function setModified(set=true){
    if (set) 
        $("#save-changes").css("display", "inline");    
    else 
        $("#save-changes").css("display", "none");    
    modified = set;
    unsavedChanges = set;
}

function showBusy(msg){
    $('.statusBar').text(msg);
    $('.statusBar').css("display","block");
    $('.page-block').addClass("spinner");
}

function clearBusy(){
    $('.statusBar').text("");
    $('.statusBar').css("display","none");
    $('.page-block').removeClass("spinner");
}


//TODO.... This may now be redundent as schedule objects directly updated. Test and update as requried. 
function stashCurrentChanges(){
    var currentFilter = $('#displayFilter option:selected').val();
    // console.log("StashCurrentChangeS: selected filter value: '" + currentFilter + "'");

    // return;

    if (viewmode == ZONEVIEW) { 
        workingSchedule[currentFilter]=screenSchedule;
    } else { //we are in DAYVIEW mode 
        for (zoneId in zones) {
            workingSchedule[zoneId][currentFilter] = screenSchedule[zoneId];
        };
    }

    // Check for any end of day slot changes, as these will have to carry over to the following day, after midnight


    modified = false;
    unsavedChanges = true;
    // console.log("On-screen schedule changes stashed into workingSchedule");
}  

function setupWorkingSchedule(){
    // console.log(evoschedule);
    workingSchedule={};
    var dhw = {};
    for (var zoneId in evoschedule){
        var name = evoschedule[zoneId].name;
        var key = zoneId //name.replace(/\s/g,"_").replace(/\'/g,"");
        var weeklySched = {};
        for (var d=0; d<7; d++) {
            var dailySched = [];
            var slots = evoschedule[zoneId].schedule[d].switchpoints;     //assumes schedule is in day order.. need to check               

            for (var slotNumber = 0; slotNumber < slots.length; slotNumber++){
                var slot = slots[slotNumber];
                var slotToD = getDecodedTime(slot.timeOfDay);
                if (slotNumber == slots.length-1) {//Last slot ends at midnight
                    dailySched.push({"setpoint" : slot.heatSetpoint, "start": slotToD, "end": 24});
                } else if (slotNumber == 0) {//Need to also add an extra slot to cover the first slot starting at midnight
                    var lastD = d-1;
                    if (lastD <0) lastD =6;
                    var lastDSlots = evoschedule[zoneId].schedule[lastD].switchpoints;
                    sp = lastDSlots[lastDSlots.length-1].heatSetpoint;
                    dailySched.push({"start": 0, "end": slotToD, "setpoint" : sp});
                    dailySched.push({"setpoint" : slot.heatSetpoint, "start": slotToD, "end": getDecodedTime(slots[slotNumber+1].timeOfDay)});
                } else {
                    dailySched.push({"setpoint" : slot.heatSetpoint, "start": slotToD, "end": getDecodedTime(slots[slotNumber+1].timeOfDay)});
                }                        
            }
            weeklySched[evoDays[d]] = dailySched;
            // console.log(name, evoDays[d], evoschedule[zoneId]["schedule"]["DailySchedules"][d]);
        }

        // if (key == "dhw") //Add this at the end of the collection - TODO... Hotwater is on or off. Need to treat separately
        //     dhw = weeklySched;
        // else 
        workingSchedule[key]=weeklySched;
    }
    if (Object.keys(dhw).length >0)
        workingSchedule["dhw"] = dhw;

    // OLD zones array.... 
    // zones.length = 0; //clear the zones array before we repopulate 
    // for (zone in workingSchedule){
    //     zones.push(zone);
    // }
}

function updateEvoScheduleWithChanges(){

    for (zoneId in zones) {
        if (zones[zoneId].name !== "dhw"){ //Hotwater is different. Leave out for now.
            for (var d=0; d<7; d++ ) {
                var slots = workingSchedule[zoneId][evoDays[d]];
                // console.log(JSON.stringify(evoschedule[zoneId].schedule.DailySchedules[d].Switchpoints));
                var newEvoSlotsForDay = [];
                for (var i=1; i < slots.length; i++){ //ignore slot 0 as that is our filler to cover period from midnight
                    // console.log(zone.zoneId, d, slots[i].start, slots[i].end, slots[i].setpoint);
                    var evoSlot = {"heatSetpoint" : slots[i].setpoint, "timeOfDay": getFormattedTime(slots[i].start)}
                    newEvoSlotsForDay.push(evoSlot)                    
                    
                    
                }
                // console.log(zone.zoneId,evoDays[d],evoSlot);
                evoschedule[zoneId].schedule[d].switchpoints = newEvoSlotsForDay;
            }
        }    
    };
}

async function intialise(){
    initZoneView();
    try{
        await loadZones()
        // console.log("LoadZone returned. Calling loadAllSchedules");
        await loadAllSchedules();	
        // console.log("loadAllSchedules returned");
    } catch (error) {
        console.error(error);
    }
}

function loadZones(){
    return new Promise((resolve, reject) => {
        showBusy("Loading zones from Evohome server...");
        // console.log("Getting zones list from server...")
        $.getJSON(HOST_URL_BASE + "/rest/getzones", function(json){
            // console.log(JSON.stringify(json));
            // Received as an array. Lets convert to dict so we can look up based on zoneId
            zones = {};
            jQuery.each(json, function(i, zone) {
                // console.log(i, zone);
                zones[zone.zoneId] = zone;
              });
            // json.forEach(element => {
            //     zones[element.zoneId] = element;
            // });
            // // zones = json;
            populateDisplayFilter();
            setModified(false);
            // console.log("Recevied zones list")
            resolve(zones);
        }).fail(function(err){
            alert("An error occured in loading the schedules\n\n" + JSON.stringify(err));
            reject(err);
        }).always(function(){
            clearBusy();
        });
    });
}

function loadScheduleForZone(zoneId,zoneName){ //TODO.... Incomplete...
    showBusy("Loading zone schedule from Evohome server...");
    console.log("Getting schedule data from server...");
    return new Promise((resolve, reject) => {
        $.getJSON(HOST_URL_BASE + "/rest/getscheduleforzone/" + zoneName, function(json){
            // console.log(JSON.stringify(json));
            var zoneSchedule = json;
            evoschedule[zoneId] = zoneSchedule;
            setupWorkingSchedule();
            setModified(false);
            // console.log("Done getting data")
            resolve(zoneSchedule);
        }).fail(function(err){
            alert("An error occured in loading the zone schedule\n\n" + JSON.stringify(err));
            reject(err);
        }).always(function(){
            clearBusy();
        });
    });
}

function loadAllSchedules(){ //Gets schedules for all zones. Can take some time.
    return new Promise((resolve, reject) => {
        showBusy("Loading all zone schedules from Evohome server...");
        // console.log("Getting schedule data from server...")
        $.getJSON(HOST_URL_BASE + "/rest/getallschedules", function(json){
            // console.log("Received JSON: " + JSON.stringify(json));
            evoschedule = json;
            setupWorkingSchedule();
            setModified(false);
    
            if ($('#displayFilter').length >0){ //select first item as default if available
                $('select>option:eq(0)').attr('selected', true);
                $("#displayFilter").change();
            }
            resolve(evoschedule);
        }).fail(function(err){
            alert("An error occured in loading the schedules");
            reject(err);
        }).always(function(){
            clearBusy();
        });
    });
}

function save(){
    return new Promise((resolve, reject) => {
        console.log("Saving changes...");
        showBusy("Saving schedules to Evohome server...");
        updateEvoScheduleWithChanges();

        $.ajax
        ({
            type: "POST",
            // dataType : 'json',
            async: true,
            crossDomain: true,
            url: HOST_URL_BASE + "/rest/saveallschedules",
            data: JSON.stringify(evoschedule),
            contentType: 'application/json',
            success: function(res) {
                $('.page-block').removeClass("spinner");
                alert("Schedules saved."); 
                setModified(false);
                
                console.log(JSON.stringify(res));
                resolve(res);
            },
            error: function(err) {
                $('.page-block').removeClass("spinner"); 
                alert("An error occured in saving the schedules.\n\nError: " + JSON.stringify(err));
                reject(err);
            },
            complete: function() {
                clearBusy();
                console.log("Done save function...");
            }
        });
    });
}
