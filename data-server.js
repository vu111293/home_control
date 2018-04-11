const { Card, Suggestion, Image, Text, Payload } = require('dialogflow-fulfillment');
const util = require('util');

const MARIKA_HOMEPAGE_URL = 'http://marika.cafe/';
const SLACK_SUPPORT = true;


class DataServer {
    constructor() {
        this.devices = [];
        // this.foods = [];
        // this.categories = [];
        // this.gifts = [];
        // this.promotions = [];
    }

    getDrinkList() {
        return this.devices;
    }

    getFoodList() {
        return this.foods;
    }

    parseFromFirebase(postSnapshot) {
        this.devices = postSnapshot.val().devices;
        // this.foods = postSnapshot.val().foodlist;
        // this.categories = postSnapshot.val().categories;
        // this.gifts = postSnapshot.val().giftList;
        // this.promotions = postSnapshot.val().promotions;
        console.log('done parse from firebase');
    }

    findDevice(name) {
        var foundItem;
        if (!name) { return foundItem; }

        for (let key in this.devices) {
            let item = this.devices[key];
            if (item.replacename == null) {
                continue;
            }
            name = name.toLowerCase();
            let nameList = item.replacename.split(',');
            for (let index in nameList) {
                let name = nameList[index];
                if (name.includes(name) == false) {
                    continue;
                }
                foundItem = item;
                break;
            }
            if (foundItem != null) {
                break;
            }
        }

        return foundItem;
    }

    buildCategories() {
        var list = [];
        for (let item in this.categories) {
            var cat = this.categories[item];
            list.push({
                'title': cat.name,
                'type': 'category',
                'image': cat.image,
                'description': cat.description
            });
        }
        return list;
    }

    buildRichCategories(agent) {
        agent.add('Danh mục sản phẩm');
        for (let i in this.categories) {
            let item = this.categories[i];
            let suggestion = new Suggestion(item.name);
            suggestion.setReply(item.name);
            agent.add(suggestion);
        }
        agent.add('Gõ tên mục cần xem sản phẩm. Ví dụ: \"thức ăn\"');
    }

    buildHotItems() {
        return [];
    }

    buildDrinkItems() {
        var list = [];
        for (let i in this.devices) {
            let item = this.devices[i];
            list.push({
                'title': item.name,
                'type': 'drink',
                'price': item.price,
                'promotion': item.promotion,
                'image': item.image
            });
        }
        return list;
    }

    buildRichDrinks(agent) {
        if (this.devices !== undefined) {
            agent.add('Xem danh mục thức uống bên dưới');
            for (let i in this.devices) {
                agent.add(new Suggestion(util.format("*%s* - (%s)",
                    this.devices[i].name,
                    this.formatPrice(this.devices[i].price))));
            }
        } else {
            agent.add('Hiện tại shop không bán thức uống.');
            this.buildRichCategories(agent);
        }
        // agent.add('• Gõ \"chi tiết {tên sản phẩm}\" để xem chi tiết sản phẩm');
        // agent.add('• Gõ \"cho tôi {số lượng} {tên sản phẩm}\" để thêm sản phẩm vào giỏ hàng');
    }

    buildRichFoods(agent) {
        if (this.foods !== undefined) {
            agent.add('Xem danh mục thức ăn bên dưới');
            for (let i in this.foods) {
                agent.add(new Suggestion(util.format("*%s* - (%s)",
                    this.foods[i].name,
                    this.formatPrice(this.foods[i].price))));
            }
        } else {
            agent.add('Hiện tại shop không bán thức uống.');
            this.buildRichCategories(agent);
        }
    }

    buildRichGifts(agent) {
        if (this.gifts !== undefined) {
            agent.add('Xem danh mục quà tặng bên dưới');
            for (let i in this.gifts) {
                agent.add(new Suggestion(util.format("*%s* - (%s)",
                    this.gifts[i].name,
                    this.formatPrice(this.gifts[i].price))));
            }
        } else {
            agent.add('Hiện tại shop không bán thức uống.');
            this.buildRichCategories(agent);
        }
    }

    buildFoodItems() {
        var list = [];
        for (let i in this.foods) {
            let item = this.foods[i];
            list.push({
                'title': item.name,
                'type': 'drink',
                'price': item.price,
                'promotion': item.promotion,
                'image': item.image
            });
        }
        return list;
    }

    buildGiftItems() {
        var list = [];
        for (let i in this.gifts) {
            let item = this.gifts[i];
            list.push({
                'title': item.name,
                'type': 'drink',
                'price': item.price,
                'promotion': item.promotion,
                'image': item.image
            });
        }
        return list;
    }

    buildPromotions() {
        var list = [];
        for (let i in this.promotions) {
            list.push({
                'title': this.promotions[i],
                'type': 'tylemode',
                'value': 120
            });
        }
        return list;
    }

    buildRichPromotions(agent) {
        for (let i in this.promotions) {
            let item = this.promotions[i];
            agent.add(new Text('• *' + item + '*'));
        }
    }

    buildHome(agent) {
        agent.add(new Text('• Gõ *\"xem menu\"* để xem danh mục menu'));
        agent.add(new Text('• Gõ *\"xem phòng\"* để xem danh sách phòng trống'));
        agent.add(new Text('• Gõ *\"xem khuyến mãi\"* để xem chương trình khuyến mãi tại quán'));
        agent.add(new Text('• Gõ *\"home, marika\"* để trở về danh mục chính'));
        agent.add(new Text('• Gõ *\"trợ giúp, help\"* để xem hướng dẫn sử dụng'));
    }

    buildCardItem(agent, product) {
        agent.add(new Card({
            title: util.format('%s - %s', product.name, this.formatPrice(product.price)),
            imageUrl: product.image,
            text: product.description ? product.description : 'Sản phẩm có sẵn tại Marika Cafe',
            buttonText: 'Marika website',
            buttonUrl: MARIKA_HOMEPAGE_URL
        })
        );
    }

    // Util methods
    formatPrice(price) {
        price = price.toString();
        let buf = [];
        let offset = 3 - price.length % 3;
        for (let i = 0; i < price.length; ++i) {
            if (i > 0 && (i + offset) % 3 == 0) {
                buf.push('.');
            }
            buf.push(price[i]);
        }
        buf.push("đ");
        return buf.join('');
    }
}

module.exports = DataServer;