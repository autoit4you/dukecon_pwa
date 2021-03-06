<template>
  <div id="timetable" class="content">
    <!-- use this for testing -->
    <!-- <span @click="draw">redraw</span> -->
    <div id="content">

      <!-- HACK: make calculateOptions and calculatedItems change  -->
      {{ calculateOptions }}
      {{ calculatedItems }}
      <!-- END OF HACK -->

      <div id="talks-schedule" v-show="Object.keys(events).length > 0">
        <div class="timeline-menu">
          <input @click="zoom(-0.2)" type="button" id="zoomIn" value="+"/>
          <input @click="zoom(+0.2)" type="button" id="zoomOut" value="-"/>
          <input @click="move(-2)" type="button" id="moveLeft" value="&lt;"/>
          <input @click="move(2)" type="button" id="moveRight" value="&gt;"/>
          <input @click="reset" type="button" id="reset" value="o"/>
        </div>
        <div ref="visualization" id="visualization">
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import Conference from '../../Conference'
import TimetableItem from './TimetableItem'
import Moment from 'moment'
// use this one instead of 'vis' to have a smaller dependency
// and avoid two instances of moment.js that would lead to not-changing date locale
// to make this work, the babel-loader in the webpack.base.conf.js needs to include the vis files
// as they will not be transpiled otherwise and would not work in phantomJS and Internet Explorer
import Vis from '../../../node_modules/vis/index-timeline-graph2d'
import Vue from 'vue'

const sortByOrder = function (o1, o2) {
  const l1 = o1.order
  const l2 = o2.order
  if (l1 === l2) {
    return 0
  } else if (l1 < l2) {
    return -1
  } else {
    return 1
  }
}

export default {
  components: {Event},
  name: 'timetable-page',
  data () {
    // add timeline, items, group and + shownComponents outside of watched elements
    // as they are updated by the computed elements
    this.timeline = null
    this.items = null
    this.groups = null
    this.shownComponents = new Map()
    return {
      events: Conference.getAllEvents(),
      locations: Conference.getAllLocations()
    }
  },
  mounted: function () {
    this.draw()
  },
  destroyed: function () {
    this.timeline.destroy()
  },
  computed: {
    calculateOptions: function () {
      // always calculate options so Vue known when to re-calculate the options
      const options = this.getOptions()
      // but only set this to the timeline if it is already rendered
      if (this.timeline) {
        this.timeline.setOptions(options)
        // we need to rebind the Vue components as otherwise the click events will not work
        this.timeline.redraw()
        Vue.nextTick(() => {
          this.rebindVueTimetableItems(true)
        }, 0)
      }
      // return dummy value
      return null
    },
    calculatedItems: function () {
      // always calculate locations and items so Vue known when to re-calculate the options
      const locations = this.generateLocations()
      const items = this.generateTableItems()
      // but only set this to the timeline if it is already rendered
      if (this.timeline) {
        locations.forEach(e => {
          if (this.groups.get(e.id)) {
            this.groups.update(e)
          } else {
            this.groups.add(e)
          }
        })
        this.groups.getIds().filter(id => this.locations[id] === undefined).forEach(id => this.groups.remove(id))

        items.forEach(e => {
          if (this.items.get(e.id)) {
            this.items.update(e)
          } else {
            this.items.add(e)
          }
        })
        this.items.getIds().filter(id => this.events[id] === undefined).forEach(id => this.items.remove(id))
        // we need to rebind the Vue components as otherwise the click events will not work
        Vue.nextTick(() => {
          this.timeline.redraw()
          Vue.nextTick(() => {
            this.rebindVueTimetableItems(true)
          }, 0)
        }, 0)
      }
      // return dummy value
      return null
    },
    hiddenDates: function () {
      // these don't normally need to change because of the "repeat", so leave it hard-coded
      // Vis hiddenDates only seem to work as long as the year matches the year of the conference
      let startDate = this.minStartTime().startOf('day').set('hour', 20)
      let endDate = startDate.clone().add(1, 'day').set('hour', 7).set('minute', 30)
      return [
        {
          start: startDate,
          end: endDate,
          repeat: 'daily'
        }
      ]
    }
  },
  methods: {
    getNewTimePoint: function (oldTime, hours) {
      let index, hiddenStart, hiddenEnd, hiddenSpan
      const oldMoment = Moment(oldTime).local()
      let newMoment = Moment(oldTime).add(hours, 'hours')
      for (index in this.hiddenDates) {
        hiddenStart = Moment(this.hiddenDates[index].start)
        hiddenEnd = Moment(this.hiddenDates[index].end)
        hiddenSpan = hiddenEnd.diff(hiddenStart, 'minutes')
        if (hours > 0 && (newMoment.hour() * 60 + newMoment.minute() > hiddenStart.hour() * 60 + hiddenStart.minute() ||
            oldMoment.day() < newMoment.day())) {
          newMoment = newMoment.add(hiddenSpan, 'minutes')
          break
        }
        if (hours < 0 && (newMoment.hour() * 60 + newMoment.minute() < hiddenEnd.hour() * 60 + hiddenEnd.minute() ||
            oldMoment.day() > newMoment.day())) {
          newMoment = newMoment.subtract(hiddenSpan, 'minutes')
          break
        }
      }
      return newMoment
    },
    generateLocations: function () {
      let locations = []
      Object.values(this.locations).sort(sortByOrder).forEach(l => {
        locations.push({id: l.id, order: l.order, content: l.names[this.$i18n.locale]})
      })
      return locations
    },
    minStartTime: function () {
      let startTime
      Object.values(this.events).forEach(e => {
        if (!startTime || e.start < startTime) {
          startTime = e.start
        }
      })
      if (!startTime) {
        startTime = '2017-01-01T08:00:00'
      }
      return Moment(startTime).locale(this.$i18n.locale)
    },
    maxEndTime: function () {
      let endTime
      Object.values(this.events).forEach(e => {
        if (!endTime || e.end > endTime) {
          endTime = e.end
        }
      })
      if (!endTime) {
        endTime = '2017-01-02T20:00:00'
      }
      return Moment(endTime)
    },
    getOptions: function () {
      return {
        locale: this.$i18n.locale,
        stack: true, // allow for parallel activities in the same room
        min: this.minStartTime(),
        start: this.minStartTime(), // TODO
        end: this.minStartTime().add(4, 'hours'), // TODO
        max: this.maxEndTime(),
        moveable: true,
        zoomable: false,
        hiddenDates: this.hiddenDates,
        editable: false,
        dataAttributes: ['tooltip', 'id'],
        margin: {
          item: {
            // minimal margin between items
            horizontal: -1, // if two events occur in the same room directly after one another, keep them in the same line (0 doesn't work)
            vertical: 5
          },
          axis: 5 // minimal margin between items and the axis
        },
        orientation: 'top'
      }
    },
    generateTableItems: function () {
      let tableItems = []
      Object.values(this.events).forEach(event => {
        if (event !== undefined) {
          tableItems.push({
            id: event.id,
            group: event.locationId,
            tooltip: event.title,
            content: '<aside id="ev-' + event.id + '"></aside>',
            start: Moment(event.start),
            end: Moment(event.end)
          })
        }
      })
      return tableItems
    },
    zoom: function (percentage) {
      let range = this.timeline.getWindow()
      let interval = range.end - range.start
      this.timeline.setWindow({
        start: range.start.valueOf() - interval * percentage,
        end: range.end.valueOf() + interval * percentage
      })
    },
    reset: function () {
      this.timeline.setWindow({
        start: this.timeline.options.start,
        end: this.timeline.options.end
      })
    },
    rebindVueTimetableItems: function (clear) {
      let timeline = this.timeline
      let items = timeline.getVisibleItems()
      let shownComponents = this.shownComponents
      if (clear === true) {
        shownComponents.forEach((item, key, map) => {
          item.$destroy()
          map.delete(key)
        })
      }
      let boundComponents = false
      items.filter(id => !shownComponents.has(id)).forEach(id => {
        if (this.$el.querySelector('#ev-' + id) !== null) {
          let e = this.events[id]
          let vm = new Vue({
            ...TimetableItem,
            propsData: {
              event: e,
              name: 'timetable-item'
            },
            parent: this
          }).$mount('#ev-' + e.id)
          boundComponents = true
          shownComponents.set(id, vm)
        }
      })
      if (boundComponents) {
        window.setTimeout(() => {
          // we bound the Vue components, the height of the elements changed
          // let's ask timeline to redraw - this will adjust the heights
          timeline.redraw()
        }, 0)
      }
    },
    move: function (hours) {
      const range = this.timeline.getWindow()
      let newStart = this.getNewTimePoint(range.start, hours)
      let newEnd = this.getNewTimePoint(range.end, hours)
      if (newStart.isBefore(this.minStartTime())) {
        newEnd = this.minStartTime().add(Moment(range.end).diff(Moment(range.start), 'minutes'), 'minutes')
        newStart = this.minStartTime()
      }
      if (newEnd.isAfter(this.maxEndTime()) || newStart.isBefore(this.minStartTime())) {
        newStart = this.maxEndTime().subtract(Moment(range.end).diff(Moment(range.start), 'minutes'), 'minutes')
        newEnd = this.maxEndTime()
      }
      // out of range
      this.timeline.setWindow({
        start: newStart,
        end: newEnd
      })
    },
    draw: function () {
      let container = this.$refs.visualization
      // create timeline
      this.timeline = new Vis.Timeline(container)
      const timeline = this.timeline
      timeline.setOptions(this.getOptions())
      this.groups = new Vis.DataSet(this.generateLocations())
      timeline.setGroups(this.groups)
      this.items = new Vis.DataSet(this.generateTableItems())
      timeline.setItems(this.items)
      // once the range changes and more items become visible we need to re-bind the missing elements
      // no parameter 'true' here as this would otherwise slow down the rendering and is not necessary
      timeline.on('changed', this.rebindVueTimetableItems)
    }
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped="true">
  div.talk-widget {
    width: 100%
  }
</style>
