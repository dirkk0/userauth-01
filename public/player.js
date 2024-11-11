"use strict"

export function ytManager(ytPlayer) {
  let timeoutId = null

  let timeupdater = null

  let currentState = null

  let next = null

  let filtered = null

  let data = null

  let dataMode = "local"

  let dirkMode = JSON.parse(localStorage.getItem("dirkMode"))

  let version = "0.1.0"

  document.querySelector("#version").innerText = "v" + version

  this.init = async () => {
    // data = await this.getData()
    // filtered = JSON.parse(JSON.stringify(data))
    // this.buildTable()

    data = await (await fetch("data/data.json")).json()
    data = JSON.parse(data.content)
    // console.log(data)
    filtered = JSON.parse(JSON.stringify(data))
    // console.log(filtered)
    this.buildTable()

    document.getElementById(ui.play).addEventListener("click", togglePlay)
    setTimeout(() => {
      console.log(ytPlayer)
      this.timeupdater = setInterval(() => updateProgressBar(), 100)
      // this.update()
    }, 1000)
  }

  this.update = async (mydata) => {
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get("dd1")) {
      // direkt links always win
      data = await this.getData()
    } else {
      // localStorage.clear("data")
      if (mydata) {
        console.log("case 1")
        data = mydata
        localStorage.setItem("data", JSON.stringify(data))
      } else if (localStorage.getItem("data") && localStorage.getItem("data").length > 0) {
        console.log("case 2")
        // console.log("using local data", localStorage.getItem("data"))
        data = JSON.parse(localStorage.getItem("data"))
      } else {
        console.log("case 3")
        data = await this.getData()
        if (data.length > 0) localStorage.setItem("data", JSON.stringify(data))
      }
    }

    filtered = JSON.parse(JSON.stringify(data))
    this.buildTable()
  }

  // function onPlayerReady(event) {
  //   // ytPlayer.setPlaybackQuality("small")
  //   document.getElementById(ui.play).addEventListener("click", togglePlay)
  //   timeupdater = setInterval(initProgressBar, 100)
  // }

  this.onPlayerStateChange = (evt) => {
    console.log("state change", evt.data)
    currentState = evt.data
    if (evt.data == YT.PlayerState.ENDED) {
      document.getElementById(ui.play).classList.remove("pause")
      // document.getElementById(ui.percentage).style.width = 0
      // document.getElementById(ui.currentTime).innerHTML = "00:00"
      // ytPlayer.seekTo(0, true)
      document.querySelector(".audio-player").style.background = "grey"
      if (next) this.doit(next)
    }
    if (evt.data == YT.PlayerState.PLAYING) {
      document.getElementById(ui.play).classList.remove("play")
      document.getElementById(ui.play).classList.add("pause")
      // console.log(timeoutId)
      clearTimeout(timeoutId)
      console.log("starting to play")
      document.querySelector(".audio-player").style.background = "lightgreen"
    }
    if (evt.data == YT.PlayerState.PAUSED) {
      document.querySelector(".audio-player").style.background = "lightgrey"
    }
    if (evt.data == YT.PlayerState.BUFFERING) {
      console.log("buffering")
      document.querySelector(".audio-player").style.background = "#ff9090"
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        console.log("nah didnt work")
        document.querySelector(".audio-player").style.background = "red"
      }, 3000)
      // console.log(timeoutId)
    }
  }

  // ========================
  this.getData = async () => {
    let data = []

    const urlParams = new URLSearchParams(window.location.search)
    let newLink = `editor.html?dd1=${urlParams.get("dd1")}`
    document.querySelector("#editor1").setAttribute("href", newLink)

    if (urlParams.get("dd1")) {
      dataMode = "external"

      document.querySelector("#search-container").style.display = "none"
      let temp = document.getElementById("result").textContent
      console.log("temp", temp)
      if (temp) {
        temp = JSON.parse(temp)

        let msg1Div = document.querySelector("#msg1")
        msg1Div.innerText = temp[0].split("\n")[0]
        msg1Div.hidden = false

        if (temp[0].split("\n")[1]) {
          let msg2Div = document.querySelector("#msg2")
          msg2Div.innerText = temp[0].split("\n")[1]
          msg2Div.hidden = false
        }

        for (let idx = 1; idx < (temp.length - 0) / 2; idx++) {
          const artist = temp[idx * 2 - 1]
          const id_youtube = temp[idx * 2]
          let o = {
            id: idx,
            id_youtube: id_youtube,
            artist: artist,
            title: "",
            dur: 0,
          }
          if (artist) {
            data.push(o)
            console.log(o)
          }
        }
      }
    }
    if (urlParams.get("dd2")) {
      dataMode = "local"
      let url = urlParams.get("dd2") //"data2.json"
      try {
        data = await (await fetch(url)).json()
      } catch (err) {
        console.error("error fetching data", err)
        let msg2Div = document.querySelector("#msg2")
        msg2Div.innerHTML = `<red>${url} does not exist</red>`
        msg2Div.hidden = false

        if (url == "data.json") dirkMode = true

        // alert(`error fetching data: ${err}`)
      }
    }

    return data
  }

  this.buildTable = () => {
    let temp = `<table>`
    // console.log(filtered)
    for (let idx = 0; idx < filtered.length; idx++) {
      const el = filtered[idx]
      // console.log(el)
      let date = new Date(null)
      // date.setSeconds(el.dur)
      el.dur = 0 // date.toISOString().substr(12, 7)
      temp += `<tr title="${el.id_youtube}" class="t-row">`
      if (dataMode == "local") {
        // temp += `<td><span onclick=yt_mgr.doit(${idx}, 1)>${el.id}</span></td>`
        temp += `<td><span onclick="yt_mgr.doit(${idx}, 1)">${el.artist}</span></td>`
        temp += `<td><span onclick="yt_mgr.doit(${idx}, 1)">${el.title}</span></td>`
        temp += `<td width="70px"><span onclick="yt_mgr.doit(${idx}, 0)">${el.dur}</span></td>`
      } else {
        temp += `<td><span onclick=yt_mgr.doit(${idx}, 1)>${el.id}</span></td>`
        temp += `<td><span onclick="yt_mgr.doit(${idx}, 1)">${el.artist}</span></td>`
        // temp += `<td><span onclick="yt_mgr.doit(${idx}, 1)">${el.dur}</span></td>`
      }
    }
    temp += "</tr></table>"
    // console.log(temp)
    document.querySelector("#list").innerHTML = temp
  }

  this.search = () => {
    let txt = document.querySelector("#search").value
    // txt = "traight"
    console.log(txt)
    filtered = data.filter((item) => {
      let record = item.artist + " " + item.title
      if (item.pl) record += " " + item.pl
      return record.toLowerCase().includes(txt)
    })
    console.log(filtered)

    this.buildTable()
  }

  this.doit = async (idx, flag) => {
    console.log(idx, flag)
    let el = filtered[idx]

    next = idx + 1

    if (flag) {
      console.log("trying to play REMOTE", el.id, el.artist, el.id_youtube)
      ytPlayer.loadVideoById({ videoId: filtered[idx].id_youtube }) // cue ...
      // // let txt = filtered.filter((d)=> {return d.id == id})
      // // console.log(txt)

      document.querySelector("#now").innerText = `${filtered[idx].artist}`
      // document.querySelector("#now").innerText = `${filtered[idx].txt}  (${filtered[idx].id})`
    } else {
      console.log("trying to play LOCAL", el.id, el.artist, el.id_youtube)
      let url = "https://dirkk0.spdns.eu:5003/log/" + el.id_youtube
      if (dirkMode) await (await fetch(url)).text()
    }
  }

  this.init()
}

// ==================

window.ui = {
  play: "playAudio",
  audio: "audio",
  percentage: "percentage",
  seekObj: "seekObj",
  currentTime: "currentTime",
}

function togglePlay() {
  if (ytPlayer.getPlayerState() === 1) {
    ytPlayer.pauseVideo()
    document.getElementById(ui.play).classList.remove("pause")
  } else {
    ytPlayer.playVideo()
    document.getElementById(ui.play).classList.add("pause")
  }
}

function calculatePercentPlayed() {
  let percentage = (ytPlayer.getCurrentTime() / ytPlayer.getDuration()).toFixed(2) * 100
  document.getElementById(ui.percentage).style.width = `${percentage}%`
}

function calculateCurrentValue(currentTime) {
  const currentMinute = parseInt(currentTime / 60) % 60
  const currentSecondsLong = currentTime % 60
  const currentSeconds = currentSecondsLong.toFixed()
  const currentTimeFormatted = `${currentMinute < 10 ? `0${currentMinute}` : currentMinute}:${currentSeconds < 10 ? `0${currentSeconds}` : currentSeconds}`

  return currentTimeFormatted
}

function updateProgressBar() {
  if (!ytPlayer.getCurrentTime) return
  const currentTime = calculateCurrentValue(ytPlayer.getCurrentTime())
  document.getElementById(ui.currentTime).innerHTML = currentTime
  document.getElementById(ui.seekObj).addEventListener("click", seek)

  function seek(e) {
    const percent = e.offsetX / this.offsetWidth
    ytPlayer.seekTo(percent * ytPlayer.getDuration())
  }

  calculatePercentPlayed()
  // console.log(currentState)
}

// =================
